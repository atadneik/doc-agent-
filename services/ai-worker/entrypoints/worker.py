import fcntl
import os
import signal
import threading
import uuid
import time
import json
from pathlib import Path
from dotenv import load_dotenv
import redis
from application.workflow import Workflow
from infrastructure.documents import LocalDocuments
from infrastructure.repository import MongoRepository, now

ROOT=Path(__file__).resolve().parents[3]
load_dotenv(ROOT/'.env')

def run(runtime, once=False):
    repository=MongoRepository(os.getenv('MONGO_URL','mongodb://127.0.0.1:27028'),os.getenv('MONGO_DB','logistics'))
    queue=redis.Redis.from_url(os.getenv('REDIS_URL','redis://127.0.0.1:6389'),decode_responses=True)
    stream,group,consumer=os.getenv('REDIS_STREAM','logistics:jobs'),'workers',str(uuid.uuid4())
    try: queue.xgroup_create(stream,group,id='0',mkstream=True)
    except redis.ResponseError as e:
        if 'BUSYGROUP' not in str(e): raise
    workflow=Workflow(runtime,LocalDocuments(os.getenv('STORAGE_ROOT',str(ROOT/'runtime/storage'))),int(os.getenv('MAX_REREADS','1')))
    def status():
        if runtime.identity.startswith('TEST_'): return
        while True:
            (ROOT/'runtime/worker-status.json').write_text(json.dumps({'worker':'ready','model':runtime.identity,'timestamp':time.time()*1000}))
            time.sleep(20)
    threading.Thread(target=status,daemon=True).start()
    def timeout(_signum,_frame): raise TimeoutError('PROCESSING_TIMEOUT')
    signal.signal(signal.SIGALRM,timeout)
    print(f'Worker ready: {runtime.identity}',flush=True)
    while True:
        # Reconcile a crash between terminal job write and result projection.
        for job in repository.db.jobs.find({'status':{'$in':['completed','needs_review']},'result':{'$exists':True}}).limit(100): repository.project(job['_id'])
        # Exhausted abandoned claims must become terminal, not stay processing forever.
        repository.db.jobs.update_many({'status':'processing','attempts':{'$gte':3},'lease_until':{'$lt':now()}},{'$set':{'status':'failed','error':'RETRY_EXHAUSTED: worker bỏ dở 3 lần'}})
        reclaimed=queue.xautoclaim(stream,group,consumer,100000,'0-0',count=1)[1]
        messages=reclaimed or (queue.xreadgroup(group,consumer,{stream:'>'},count=1,block=2000) or [])
        if not reclaimed: messages=messages[0][1] if messages else []
        for message_id,payload in messages:
            job_id=payload.get('job_id'); token=str(uuid.uuid4())
            if repository.project(job_id): queue.xack(stream,group,message_id); continue
            job=repository.claim(job_id,token)
            if not job:
                existing=repository.db.jobs.find_one({'_id':job_id})
                if not existing or existing['status']=='failed': queue.xack(stream,group,message_id)
                continue
            stop=threading.Event()
            def heartbeat():
                while not stop.wait(20):
                    try: repository.heartbeat(job,token)
                    except Exception as e: print(f'heartbeat: {e}',flush=True)
            thread=threading.Thread(target=heartbeat,daemon=True); thread.start()
            try:
                signal.alarm(int(os.getenv('JOB_TIMEOUT_SECONDS','600')))
                documents=list(repository.db.documents.find({'_id':{'$in':job['document_ids']}}))
                if len(documents)!=len(job['document_ids']): raise ValueError('MISSING_DOCUMENT')
                result=workflow.run(job,documents)
                repository.save(job,token,result)
                queue.xack(stream,group,message_id)
            except Exception as e:
                print(f'Job {job_id}: {e}',flush=True)
                repository.fail(job,token,e)
                # ACK only after retry/terminal failure has been persisted. Outbox re-enqueues queued jobs.
                queue.xack(stream,group,message_id)
            finally: signal.alarm(0); stop.set(); thread.join(timeout=1)
            if once: return

if __name__=='__main__':
    # Host-level lock held before loading weights: multiple worker commands cannot load multiple checkpoints.
    lock_path=ROOT/'runtime/gpu-worker.lock'; lock_path.parent.mkdir(exist_ok=True)
    with lock_path.open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        from infrastructure.runtime import LocalRuntime
        try:
            run(LocalRuntime())
        except Exception as error:
            (ROOT/'runtime/worker-status.json').write_text(json.dumps({'worker':'unavailable','message':str(error),'timestamp':time.time()*1000}))
            raise
