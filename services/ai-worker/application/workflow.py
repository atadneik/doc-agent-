import json
from pathlib import Path
from jsonschema import validate
from domain.models import Extraction
from domain.normalize import normalize
from domain.rules import evaluate

ROOT = Path(__file__).resolve().parents[3]

class Workflow:
    def __init__(self, runtime, documents, max_rereads=1):
        self.runtime, self.documents, self.max_rereads = runtime, documents, max_rereads
        self.rules = json.loads((ROOT / 'knowledge/rules/demo-v1.json').read_text())
        validate(self.rules, json.loads((ROOT / 'contracts/schemas/rules.json').read_text()))
        self.profile = json.loads((ROOT / 'knowledge/document-profiles/default.json').read_text())

    def run(self, job, documents):
        extractions = []; metric_start = len(self.runtime.metrics)
        for document in documents:
            result = {'document_id':document['_id'], 'document_type':'unknown', 'fields':{}}
            types = set()
            for page in self.documents.pages(document):
                classification = self.runtime.infer('classify', page, {})
                kind = classification.get('document_type','unknown')
                if kind not in {'invoice','packing_list','bill_of_lading','certificate_of_origin','unknown'}: kind = 'unknown'
                types.add(kind)
                response = self.runtime.infer('extract', page, {'document_type':kind,'fields':self.profile['fields']})
                for attempt in range(self.max_rereads + 1):
                    fields = self.anchor(response, document, page)
                    if attempt == self.max_rereads or not any(v['verification_status'] != 'anchored' for values in fields.values() for v in values): break
                    unresolved=[name for name,values in fields.items() if any(v['verification_status']!='anchored' for v in values)]
                    target=unresolved[0]
                    region=self.region(page,target,fields[target])
                    try:
                        reread=self.runtime.infer('reread',region,{'document_type':kind,'fields':[target],'previous':response.get('fields',{}).get(target),'region':region is not page})
                    finally:
                        if region is not page: region['image'].close()
                    if target in reread.get('fields',{}): response.setdefault('fields',{})[target]=reread['fields'][target]
                for name, values in fields.items(): result['fields'].setdefault(name, []).extend(values)
            for name, values in result['fields'].items():
                observed=[v for v in values if v['raw_value'] is not None]
                result['fields'][name]=observed or values[:1]
            result['document_type'] = next(iter(types)) if len(types)==1 else 'unknown'
            parsed = Extraction.model_validate(result).model_dump()
            validate(parsed, json.loads((ROOT / 'contracts/schemas/extraction.json').read_text()))
            extractions.append(parsed)
        findings = evaluate(extractions, self.rules, job['_id'])
        review = any(f['status'] in ('mismatch','insufficient_data') for f in findings) or any(d['document_type']=='unknown' for d in extractions)
        return {'job_id':job['_id'],'dossier_id':job['dossier_id'],'status':'needs_review' if review else 'completed','model':self.runtime.identity,'metrics':self.runtime.metrics[metric_start:],'extractions':extractions,'findings':findings}

    def anchor(self, response, document, page):
        fields = {}
        for name, values in response.get('fields',{}).items():
            if name not in self.profile['fields'] or not isinstance(values,list): continue
            for candidate in values[:200]:
                raw = candidate.get('raw_value'); raw = raw if isinstance(raw,str) else None
                evidence = candidate.get('evidence_text'); evidence = evidence if isinstance(evidence,str) else None
                value, unit, status = normalize(name, raw, candidate.get('unit'))
                matches = [b for b in page['blocks'] if evidence and raw and evidence in b['text'] and raw in evidence]
                box = None
                if len(matches)==1 and value is not None:
                    box = matches[0]['bbox']; status = 'anchored'
                entry = {'raw_value':raw,'normalized_value':value,'unit':unit,'currency':candidate.get('currency'),'document_id':document['_id'],'page_number':page['number'],'evidence_text':evidence,'bbox':box,'coordinate_system':page['coordinate_system'],'page_width':page['width'],'page_height':page['height'],'extraction_method':page['method'] if box else 'model','verification_status':status,'scope':candidate.get('scope','shipment'),'scope_id':candidate.get('scope_id')}
                fields.setdefault(name,[]).append(entry)
        for name in self.profile['fields']:
            if name not in fields:
                fields[name]=[{'raw_value':None,'normalized_value':None,'unit':None,'currency':None,'document_id':document['_id'],'page_number':page['number'],'evidence_text':None,'bbox':None,'coordinate_system':page['coordinate_system'],'page_width':page['width'],'page_height':page['height'],'extraction_method':'model','verification_status':'unresolved','scope':'shipment','scope_id':None}]
        return fields

    def region(self,page,name,values):
        # Crop only from an existing text/OCR block, never from model-supplied coordinates.
        quotes=[v['evidence_text'] for v in values if v['evidence_text']]
        matches=[b for b in page['blocks'] if any(q in b['text'] for q in quotes) or name.replace('_',' ') in b['text'].lower() or name in b['text'].lower()]
        if len(matches)!=1 or 'image' not in page: return page
        x0,y0,x1,y1=matches[0]['bbox']; sx=page['image'].width/page['width'];sy=page['image'].height/page['height']
        box=(max(0,int(x0*sx)-24),max(0,int(y0*sy)-24),min(page['image'].width,int(x1*sx)+24),min(page['image'].height,int(y1*sy)+24))
        return {**page,'image':page['image'].crop(box),'text':matches[0]['text']}
