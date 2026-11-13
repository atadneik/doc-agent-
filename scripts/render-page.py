import io
import sys
import fitz
from PIL import Image

path,mime,number=sys.argv[1:]; number=int(number)
if mime=='application/pdf':
    with fitz.open(path) as pdf:
        page=pdf[number-1]; factor=min(1.5,(1048576/(page.rect.width*page.rect.height))**.5)
        sys.stdout.buffer.write(page.get_pixmap(matrix=fitz.Matrix(factor,factor),alpha=False).tobytes('png'))
else:
    if number!=1: raise ValueError('Invalid page')
    with Image.open(path) as original:
        if original.width*original.height>40_000_000: raise ValueError('Image too large')
        image=original.convert('RGB'); factor=min(1,(1048576/(image.width*image.height))**.5)
        image.thumbnail((max(1,int(image.width*factor)),max(1,int(image.height*factor))))
        image.save(sys.stdout.buffer,format='PNG')
