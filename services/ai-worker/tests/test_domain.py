import json
from copy import deepcopy
from pathlib import Path
import pytest
from jsonschema import validate, ValidationError
from domain.normalize import number,date,normalize
from domain.rules import evaluate
from application.workflow import Workflow, ROOT
from tests.fake_runtime import FakeRuntime

@pytest.mark.parametrize('raw,expected',[('1,234.50','1234.50'),('1.234,50','1234.50'),('12,50','12.50'),('1,234',None),('1.234',None),('1,23,45',None),('1000','1000'),('NaN',None),('12 345,67','12345.67')])
def test_numbers(raw,expected): assert number(raw)==expected
@pytest.mark.parametrize('raw,expected',[('2026-09-15','2026-09-15'),('15/09/2026','2026-09-15'),('03/04/2026',None),('31/02/2026',None)])
def test_dates(raw,expected): assert date(raw)==expected
def test_units(): assert normalize('gross_weight','12','KGS')[:2]==('12','kg')

class Pages:
    def pages(self,doc):
        data=json.loads((ROOT/'evaluation/fixtures/shipment.json').read_text())[doc['_id']]
        lines=[data['title']]+data['lines']
        yield {'number':1,'width':595,'height':842,'text':'\n'.join(lines),'blocks':[{'text':line,'bbox':[45,40+i*30,500,55+i*30]} for i,line in enumerate(lines)],'method':'pdf_text','coordinate_system':'pdf_points'}

@pytest.fixture
def result():
    return Workflow(FakeRuntime(),Pages()).run({'_id':'test','dossier_id':'test'},[{'_id':n} for n in ['invoice','packing_list','bill_of_lading','certificate_of_origin']])

def test_known_mismatch(result):
    mismatches=[f for f in result['findings'] if f['status']=='mismatch']
    assert len(mismatches)==1 and mismatches[0]['rule']['id']=='gross-weight'
    assert all(f['status']=='match' for f in result['findings'] if f['rule']['id']!='gross-weight')
    assert result['model']=='TEST_ONLY_FAKE_INFERENCE'

def test_missing_units_scope_and_unresolved(result):
    rule=json.loads((ROOT/'knowledge/rules/demo-v1.json').read_text())[:1]
    for change in ({'unit':'t'},{'scope':'container'},{'verification_status':'unresolved'},{'normalized_value':None}):
        docs=deepcopy(result['extractions']);docs[1]['fields']['gross_weight'][0].update(change)
        assert evaluate(docs,rule,'test')[0]['status']=='insufficient_data'
    assert evaluate([],rule,'test')[0]['status']=='insufficient_data'

def test_no_fabricated_boxes():
    workflow=Workflow(FakeRuntime(),Pages())
    page=next(Pages().pages({'_id':'invoice'}))
    fields=workflow.anchor({'fields':{'seller':[{'raw_value':'MADE UP','evidence_text':'MADE UP','bbox':[0,0,1,1]}]}},{'_id':'invoice'},page)
    assert fields['seller'][0]['bbox'] is None
    assert fields['seller'][0]['verification_status']=='unresolved'

def test_contracts(result):
    schema=json.loads((ROOT/'contracts/schemas/extraction.json').read_text())
    for extraction in result['extractions']: validate(extraction,schema)
    bad=deepcopy(result['extractions'][0]);bad['fields']['invoice_number'][0]['page_number']=0
    with pytest.raises(ValidationError): validate(bad,schema)

def test_invoice_adjustments_required(result):
    invoice=deepcopy(result['extractions'][0]);del invoice['fields']['tax']
    rules=json.loads((ROOT/'knowledge/rules/demo-v1.json').read_text())[-1:]
    assert evaluate([invoice],rules,'x')[0]['status']=='insufficient_data'

def test_stable_finding_identity(result):
    rules=json.loads((ROOT/'knowledge/rules/demo-v1.json').read_text())
    assert evaluate(result['extractions'],rules,'test')==result['findings']
