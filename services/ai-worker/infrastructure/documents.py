import os
from pathlib import Path
import fitz
from PIL import Image

class LocalDocuments:
    def __init__(self, storage):
        root=Path(__file__).resolve().parents[3]
        self.storage = (Path(storage) if Path(storage).is_absolute() else root/storage).resolve(); self.ocr = None
        self.max_pixels = int(os.getenv('MAX_PIXELS','1048576'))

    def pages(self, document):
        path = (self.storage / document['key']).resolve()
        if path.parent != self.storage: raise ValueError('Invalid storage path')
        if document['mime_type']=='application/pdf':
            with fitz.open(path) as pdf:
                if pdf.is_encrypted: raise ValueError('PDF mã hóa không được hỗ trợ')
                if len(pdf)>int(os.getenv('MAX_PAGES','100')): raise ValueError('PDF vượt giới hạn số trang')
                for index in range(len(pdf)):
                    page = pdf[index]; width, height = page.rect.width, page.rect.height
                    if width<=0 or height<=0: raise ValueError('Invalid page dimensions')
                    scale = min(1.5, (self.max_pixels/(width*height))**0.5)
                    pix = page.get_pixmap(matrix=fitz.Matrix(scale,scale), alpha=False)
                    image = Image.frombytes('RGB', (pix.width,pix.height), pix.samples); del pix
                    blocks = [{'text':b[4], 'bbox':list(fitz.Rect(b[:4])*page.rotation_matrix)} for b in page.get_text('blocks') if len(b)>6 and b[6]==0]
                    text = '\n'.join(b['text'] for b in blocks)
                    if len(text.strip())>=40 and sum(c.isalnum() for c in text)/max(len(text),1)>.35:
                        yield {'number':index+1,'width':width,'height':height,'image':image,'blocks':blocks,'text':text,'method':'pdf_text','coordinate_system':'pdf_points'}
                    else:
                        yield self.ocr_page(image,index+1)
                    image.close()
        else:
            with Image.open(path) as original:
                if original.width*original.height>40_000_000: raise ValueError('Ảnh vượt 40 megapixel')
                if getattr(original,'n_frames',1)>1: raise ValueError('Ảnh nhiều frame không được hỗ trợ')
                image = original.convert('RGB'); factor = min(1,(self.max_pixels/(image.width*image.height))**.5)
                image.thumbnail((max(1,int(image.width*factor)),max(1,int(image.height*factor))))
                yield self.ocr_page(image,1)
                image.close()

    def ocr_page(self,image,number):
        if self.ocr is None:
            det, rec = os.getenv('OCR_DET_PATH',''), os.getenv('OCR_REC_PATH','')
            root=Path(__file__).resolve().parents[3]
            if det and not Path(det).is_absolute(): det=str(root/det)
            if rec and not Path(rec).is_absolute(): rec=str(root/rec)
            if not det or not rec or not Path(det).is_dir() or not Path(rec).is_dir():
                raise RuntimeError('OCR_UNAVAILABLE: cấu hình trọng số PaddleOCR local trước khi xử lý scan')
            from paddleocr import PaddleOCR
            self.ocr = PaddleOCR(device='cpu', text_detection_model_dir=det,text_recognition_model_dir=rec,use_doc_orientation_classify=False,use_doc_unwarping=False,use_textline_orientation=False)
        import numpy as np
        blocks=[]
        for result in self.ocr.predict(np.array(image)):
            for text,poly in zip(result['rec_texts'],result['rec_polys']):
                xs=[float(p[0]) for p in poly]; ys=[float(p[1]) for p in poly]
                blocks.append({'text':text,'bbox':[min(xs),min(ys),max(xs),max(ys)]})
        return {'number':number,'width':image.width,'height':image.height,'image':image,'blocks':blocks,'text':'\n'.join(b['text'] for b in blocks),'method':'ocr','coordinate_system':'image_pixels'}
