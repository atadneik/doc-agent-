import json
import fcntl
from pathlib import Path
from dotenv import load_dotenv
from PIL import Image
from infrastructure.runtime import LocalRuntime

root=Path(__file__).resolve().parents[3]
load_dotenv(root/'.env')
report={'status':'INFERENCE_UNVERIFIED','model':None}
try:
    lock_path=root/'runtime/gpu-worker.lock';lock_path.parent.mkdir(exist_ok=True)
    with lock_path.open('w') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        runtime=LocalRuntime()
        with Image.open(root/'runtime/fixtures/invoice.png') as image:
            output=runtime.infer('classify',{'image':image,'text':''},{})
        report={'status':'PASS' if output.get('document_type')=='invoice' else 'FAIL','model':runtime.identity,'output':output,'metrics':runtime.metrics}
except Exception as error:
    report['reason']=str(error)
(root/'runtime/inference-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))
raise SystemExit(0 if report['status']=='PASS' else 1)
