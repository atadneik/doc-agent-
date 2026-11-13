from datetime import datetime, timezone, timedelta
from pymongo import MongoClient, ReturnDocument
from bson import BSON

def now(): return datetime.now(timezone.utc)

class MongoRepository:
    def __init__(self,url,database):
        self.db=MongoClient(url)[database]
        self.db.results.create_index('job_id',unique=True)
    def claim(self,job_id,token):
        return self.db.jobs.find_one_and_update({'_id':job_id,'status':{'$in':['queued','processing']},'$or':[{'lease_until':{'$lt':now()}},{'lease_until':{'$exists':False}}], 'attempts':{'$lt':3}}, {'$set':{'status':'processing','token':token,'lease_until':now()+timedelta(seconds=90)},'$inc':{'attempts':1}},return_document=ReturnDocument.AFTER)
    def heartbeat(self,job,token):
        return self.db.jobs.update_one({'_id':job['_id'],'token':token,'status':'processing'},{'$set':{'lease_until':now()+timedelta(seconds=90)}}).modified_count
    def save(self,job,token,result):
        if len(BSON.encode(result))>12*1024*1024: raise RuntimeError('RESULT_LIMIT: kết quả vượt 12 MiB, chia nhỏ bộ chứng từ')
        # Lease token fences obsolete writers. Result and terminal status in the same job document are atomic.
        updated=self.db.jobs.update_one({'_id':job['_id'],'token':token,'status':'processing'},{'$set':{'result':result,'status':result['status'],'finished_at':now()},'$unset':{'lease_until':'','error':''}})
        if not updated.modified_count: raise RuntimeError('LEASE_LOST')
        self.project(job['_id'])
    def project(self,job_id):
        job=self.db.jobs.find_one({'_id':job_id})
        if job and 'result' in job:
            self.db.results.update_one({'job_id':job_id},{'$setOnInsert':job['result']},upsert=True)
            return True
        return False
    def fail(self,job,token,error):
        status='failed' if job['attempts']>=3 else 'queued'
        self.db.jobs.update_one({'_id':job['_id'],'token':token,'status':'processing'},{'$set':{'status':status,'error':str(error)[:2000],'dispatch_at':datetime(1970,1,1,tzinfo=timezone.utc)},'$unset':{'lease_until':''}})
        return status
