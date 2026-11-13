import fitz
import pytest
from infrastructure.documents import LocalDocuments

def test_rotated_pdf_evidence(tmp_path):
    path=tmp_path/'rotated'
    with fitz.open() as pdf:
        page=pdf.new_page(width=595,height=842)
        page.insert_text((40,70),'Gross weight: 1000 kg. This is useful document text for rotation testing.')
        page.set_rotation(90);pdf.save(path)
    pages=LocalDocuments(str(tmp_path)).pages({'key':'rotated','mime_type':'application/pdf'})
    page=next(pages)
    assert page['width']==842 and page['height']==595
    x0,y0,x1,y1=page['blocks'][0]['bbox']
    assert 0<=x0<x1<=842 and 0<=y0<y1<=595
    assert x0>700
    pages.close()

def test_page_limit(tmp_path,monkeypatch):
    with fitz.open() as pdf:
        pdf.new_page();pdf.new_page();pdf.save(tmp_path/'two')
    monkeypatch.setenv('MAX_PAGES','1')
    with pytest.raises(ValueError,match='số trang'):
        next(LocalDocuments(str(tmp_path)).pages({'key':'two','mime_type':'application/pdf'}))

def test_scan_requires_explicit_ocr_models(tmp_path,monkeypatch):
    with fitz.open() as pdf:
        pdf.new_page();pdf.save(tmp_path/'scan')
    monkeypatch.delenv('OCR_DET_PATH',raising=False);monkeypatch.delenv('OCR_REC_PATH',raising=False)
    with pytest.raises(RuntimeError,match='OCR_UNAVAILABLE'):
        next(LocalDocuments(str(tmp_path)).pages({'key':'scan','mime_type':'application/pdf'}))
