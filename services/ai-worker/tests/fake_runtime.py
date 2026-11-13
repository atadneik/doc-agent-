import re

class FakeRuntime:
    """Only for synthetic fixture tests. Never imported by the production entrypoint."""
    identity='TEST_ONLY_FAKE_INFERENCE'; metrics=[]
    def infer(self,role,page,context):
        text=page['text']
        if role=='classify':
            names={'INVOICE':'invoice','PACKING LIST':'packing_list','BILL OF LADING':'bill_of_lading','CERTIFICATE OF ORIGIN':'certificate_of_origin'}
            return {'document_type':next((v for k,v in names.items() if text.startswith(k)),'unknown')}
        fields={}
        for line in text.splitlines():
            match=re.fullmatch(r'([a-z_]+): (.+?)(?: \[([^]]+)\])?',line)
            if not match: continue
            name,raw,unit=match.groups(); currency=unit if unit in {'USD','VND','EUR'} else None
            fields.setdefault(name,[]).append({'raw_value':raw,'unit':None if currency else unit,'currency':currency,'evidence_text':line,'scope':'line' if name=='line_amount' else 'shipment','scope_id':str(len(fields.get(name,[]))) if name=='line_amount' else None})
        return {'fields':fields}
