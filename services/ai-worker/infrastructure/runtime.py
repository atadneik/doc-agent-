import gc
import json
import os
import time
import threading
from pathlib import Path

class LocalRuntime:
    def __init__(self):
        path = os.getenv('MODEL_PATH','')
        if path and not Path(path).is_absolute(): path=str(Path(__file__).resolve().parents[3]/path)
        if not path or not (Path(path)/'config.json').is_file():
            raise RuntimeError('INFERENCE_UNVERIFIED: thiếu MODEL_PATH/checkpoint local')
        import torch
        from transformers import AutoProcessor, Qwen3VLForConditionalGeneration, BitsAndBytesConfig
        if not torch.cuda.is_available(): raise RuntimeError('INFERENCE_UNVERIFIED: CUDA/driver không khả dụng')
        self.torch=torch; self.lock=threading.Lock(); self.metrics=[]
        self.identity=str(Path(path).resolve())
        if (Path(path)/'model-manifest.json').exists():
            manifest=json.loads((Path(path)/'model-manifest.json').read_text())
            self.identity=f"{manifest['repo']}@{manifest['revision']} ({self.identity})"
        dtype=torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        self.processor=AutoProcessor.from_pretrained(path,local_files_only=True,trust_remote_code=False)
        try:
            self.model=Qwen3VLForConditionalGeneration.from_pretrained(path,local_files_only=True,trust_remote_code=False,device_map={'':0},dtype=dtype,quantization_config=BitsAndBytesConfig(load_in_4bit=True,bnb_4bit_quant_type='nf4',bnb_4bit_use_double_quant=True,bnb_4bit_compute_dtype=dtype))
        except torch.cuda.OutOfMemoryError as error:
            gc.collect(); torch.cuda.empty_cache()
            raise RuntimeError('RESOURCE_EXHAUSTED: checkpoint không vừa GPU; cấu hình MODEL_PATH nhỏ hơn') from error
        self.model.eval()
        self.prompt=(Path(__file__).resolve().parents[3]/'knowledge/prompts/workflow.txt').read_text()

    def infer(self,role,page,context):
        with self.lock:
            torch=self.torch
            for attempt in range(2):
                inputs=outputs=None; image=page['image'].copy(); started=time.monotonic()
                pixels=int(os.getenv('MAX_PIXELS','1048576'))//(4**attempt)
                scale=min(1,(pixels/(image.width*image.height))**.5)
                image.thumbnail((max(32,int(image.width*scale)),max(32,int(image.height*scale))))
                torch.cuda.reset_peak_memory_stats()
                try:
                    messages=[{'role':'system','content':self.prompt},{'role':'user','content':[{'type':'image','image':image},{'type':'text','text':json.dumps({'role':role,'context':context,'untrusted_document_text':page['text'][:10000]})}]}]
                    inputs=self.processor.apply_chat_template(messages,tokenize=True,add_generation_prompt=True,return_dict=True,return_tensors='pt').to('cuda')
                    output_budget=max(64,int(os.getenv('MAX_OUTPUT_TOKENS','1024'))//(attempt+1))
                    if inputs['input_ids'].shape[1] + output_budget > int(os.getenv('MAX_CONTEXT','4096')): raise RuntimeError('CONTEXT_LIMIT: trang vượt giới hạn context; cần chia vùng thủ công')
                    with torch.inference_mode():
                        outputs=self.model.generate(**inputs,max_new_tokens=output_budget,do_sample=False)
                    text=self.processor.batch_decode(outputs[:,inputs['input_ids'].shape[1]:],skip_special_tokens=True)[0].strip()
                    if text.startswith('```'): text=text.split('\n',1)[1].rsplit('```',1)[0]
                    return json.loads(text)
                except torch.cuda.OutOfMemoryError as error:
                    if attempt: raise RuntimeError('RESOURCE_EXHAUSTED: inference OOM sau một lần giảm pixel/token') from error
                finally:
                    self.metrics.append({'role':role,'attempt':attempt,'seconds':time.monotonic()-started,'vram_peak_bytes':torch.cuda.max_memory_allocated()})
                    del inputs,outputs; image.close(); gc.collect(); torch.cuda.empty_cache()
