import os
import sys
import uuid
from datetime import timedelta
import redis
from infrastructure.repository import MongoRepository,now

repo=MongoRepository(os.getenv('MONGO_URL','mongodb://127.0.0.1:27028'),os.environ['MONGO_DB'])
queue=redis.Redis.from_url(os.getenv('REDIS_URL','redis://127.0.0.1:6389'))
job_id=sys.argv[1]
queue.xadd(os.environ['REDIS_STREAM'],{'job_id':job_id})
assert repo.claim(job_id,'duplicate') is None
assert repo.project(job_id)
assert repo.db.results.count_documents({'job_id':job_id})==1

test_id='resilience-'+str(uuid.uuid4())
repo.db.jobs.insert_one({'_id':test_id,'dossier_id':test_id,'request_key':'resilience','status':'queued','attempts':0,'document_ids':[]})
first=repo.claim(test_id,'first');assert first['attempts']==1
assert repo.claim(test_id,'competing') is None
repo.db.jobs.update_one({'_id':test_id},{'$set':{'lease_until':now()-timedelta(seconds=1)}})
second=repo.claim(test_id,'second');assert second['attempts']==2
result={'job_id':test_id,'dossier_id':test_id,'status':'completed','findings':[],'extractions':[],'model':'TEST_ONLY'}
try: repo.save(first,'first',result);raise AssertionError('obsolete token wrote result')
except RuntimeError as e: assert str(e)=='LEASE_LOST'
assert repo.fail(second,'second','temporary')=='queued'
third=repo.claim(test_id,'third');assert third['attempts']==3
assert repo.fail(third,'third','terminal')=='failed'
assert repo.claim(test_id,'fourth') is None
# Crash after atomic result commit, before projection: repair creates exactly one result.
repair_id='repair-'+str(uuid.uuid4())
repo.db.jobs.insert_one({'_id':repair_id,'dossier_id':repair_id,'request_key':'repair','status':'completed','result':{**result,'job_id':repair_id}})
assert repo.project(repair_id);assert repo.project(repair_id)
assert repo.db.results.count_documents({'job_id':repair_id})==1
print('PASS retry limit, competing claim, stale token fencing, deduplication, crash projection repair')

# Exercise Redis pending-entry reclaim independently of the running consumer.
stream=os.environ['REDIS_STREAM']+':reclaim'
queue.xgroup_create(stream,'test',id='0',mkstream=True)
message=queue.xadd(stream,{'job_id':'abandoned'})
queue.xreadgroup('test','dead', {stream:'>'},count=1)
claimed=queue.xautoclaim(stream,'test','replacement',0,'0-0',count=1)[1]
assert claimed[0][0]==message
queue.xack(stream,'test',message)
assert queue.xpending(stream,'test')['pending']==0
print('PASS Redis XAUTOCLAIM abandoned pending entry')
