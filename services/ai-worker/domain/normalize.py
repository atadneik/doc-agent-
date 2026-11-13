import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

def number(raw: str) -> str | None:
    text = raw.strip().replace(' ', '').replace('\u00a0', '')
    if not re.fullmatch(r'[+-]?\d+(?:[.,]\d+)*', text):
        return None
    if ',' in text and '.' in text:
        decimal = ',' if text.rfind(',') > text.rfind('.') else '.'
        grouping = '.' if decimal == ',' else ','
        integer, fraction = text.rsplit(decimal, 1)
        if not re.fullmatch(r'[+-]?\d{1,3}(?:' + re.escape(grouping) + r'\d{3})+', integer):
            return None
        text = integer.replace(grouping, '') + '.' + fraction
    elif ',' in text or '.' in text:
        separator = ',' if ',' in text else '.'
        parts = text.split(separator)
        # A single separator plus three digits is ambiguous without a locale.
        if len(parts) == 2 and len(parts[1]) == 3:
            return None
        if len(parts) > 2:
            if not all(len(p) == 3 for p in parts[1:]): return None
            text = ''.join(parts)
        else: text = text.replace(',', '.')
    try: return format(Decimal(text), 'f')
    except InvalidOperation: return None

def date(raw: str) -> str | None:
    for fmt in ('%Y-%m-%d', '%Y/%m/%d', '%d %b %Y', '%d %B %Y'):
        try: return datetime.strptime(raw.strip(), fmt).date().isoformat()
        except ValueError: pass
    match = re.fullmatch(r'(\d{1,2})[/-](\d{1,2})[/-](\d{4})', raw.strip())
    if match and int(match[1]) > 12:
        try: return datetime(int(match[3]), int(match[2]), int(match[1])).date().isoformat()
        except ValueError: pass
    return None

def normalize(name: str, raw: str | None, unit: str | None):
    units = {'kgs': 'kg', 'kg': 'kg', 'kilograms': 'kg', 'g': 'g', 'mt': 't', 'tonnes': 't', 'pcs': 'piece', 'pieces': 'piece', 'ctns': 'carton', 'cartons': 'carton'}
    normalized_unit = units.get((unit or '').lower(), unit)
    if raw is None: return None, normalized_unit, 'unresolved'
    if name.endswith('_date'): value = date(raw)
    elif name in {'packages','quantity','net_weight','gross_weight','unit_price','line_amount','total_amount','tax','fees','discount'}: value = number(raw)
    else: value = re.sub(r'\s+', ' ', raw.strip()).upper()
    return value, normalized_unit, 'ambiguous' if value is None else 'unresolved'
