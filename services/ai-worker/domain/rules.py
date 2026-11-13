from decimal import Decimal
from itertools import combinations
import hashlib
import json

def evaluate(extractions: list[dict], rules: list[dict], job_id: str) -> list[dict]:
    findings = []
    for rule in rules:
        left_docs = [d for d in extractions if rule['left_type'] in ('*', d['document_type'])]
        right_docs = [d for d in extractions if rule['right_type'] in ('*', d['document_type'])]
        if rule['operation'] == 'invoice_total': pairs = [(d, d) for d in left_docs]
        else: pairs = [(a,b) for a in left_docs for b in right_docs if a['document_id'] != b['document_id']]
        seen = set()
        if not pairs: pairs = [(None, None)]
        for a,b in pairs:
            key = tuple(sorted([a['document_id'],b['document_id']])) if a and b else ()
            if key in seen: continue
            seen.add(key)
            left = a['fields'].get(rule['field'], []) if a else []
            right = b['fields'].get(rule['field'], []) if b else []
            status, detail = 'insufficient_data', 'Thiếu giá trị tổng được xác định rõ hoặc bằng chứng chưa được gắn.'
            def usable(values): return bool(values) and all(v['normalized_value'] is not None and v['verification_status'] == 'anchored' and v['scope'] == 'shipment' for v in values)
            if rule['operation'] == 'invoice_total' and a:
                fields = a['fields']; right = fields.get('line_amount', [])
                adjustments = [fields.get(n, []) for n in ('tax','fees','discount')]
                valid_lines = bool(right) and all(v['normalized_value'] is not None and v['verification_status'] == 'anchored' and v['scope'] == 'line' and v['scope_id'] for v in right)
                currencies = {v['currency'] for v in left + right + [v for group in adjustments for v in group]}
                if usable(left) and len(left) == 1 and valid_lines and len({v['scope_id'] for v in right}) == len(right) and all(usable(v) and len(v)==1 for v in adjustments) and len(currencies)==1 and None not in currencies:
                    expected = sum(Decimal(v['normalized_value']) for v in right) + Decimal(adjustments[0][0]['normalized_value']) + Decimal(adjustments[1][0]['normalized_value']) - Decimal(adjustments[2][0]['normalized_value'])
                    status = 'match' if abs(Decimal(left[0]['normalized_value']) - expected) <= Decimal(rule['tolerance']) else 'mismatch'
                    detail = f'Tổng dòng + thuế + phí − chiết khấu = {expected}'
                    right = right + [v for group in adjustments for v in group]
            elif usable(left) and usable(right):
                if rule['operation'] == 'set_equal':
                    status = 'match' if {v['normalized_value'] for v in left} == {v['normalized_value'] for v in right} else 'mismatch'
                    detail = 'So sánh tập giá trị trong phạm vi lô.'
                elif len(left)==len(right)==1:
                    if left[0]['unit'] and left[0]['unit'] == right[0]['unit']:
                        status = 'match' if abs(Decimal(left[0]['normalized_value'])-Decimal(right[0]['normalized_value'])) <= Decimal(rule['tolerance']) else 'mismatch'
                        detail = 'So sánh tổng cùng đơn vị; không tự cộng các container/dòng.'
                    else: detail = 'Đơn vị thiếu hoặc khác nhau; không cộng/so sánh trực tiếp.'
            elif a and b and rule['left_type']=='*' and not left and not right:
                status, detail = 'not_applicable', 'Cặp chứng từ không có trường tương ứng.'
            identity = hashlib.sha256(json.dumps([job_id,rule['id'],rule['version'],key]).encode()).hexdigest()[:24]
            findings.append({'id':identity,'rule':rule,'status':status,'left':left,'right':right,'detail':detail})
    return findings
