import json
from pathlib import Path
import fitz

root=Path(__file__).resolve().parents[1]
out=root/'runtime/fixtures';out.mkdir(parents=True,exist_ok=True)
fixtures=json.loads((root/'evaluation/fixtures/shipment.json').read_text())
for name,data in fixtures.items():
    with fitz.open() as doc:
        page=doc.new_page(width=595,height=842)
        for index,line in enumerate([data['title']]+data['lines']): page.insert_text((45,50+index*30),line,fontsize=12)
        doc.save(out/f'{name}.pdf')
        if name=='invoice': page.get_pixmap().save(out/'invoice.png')
print(out)
