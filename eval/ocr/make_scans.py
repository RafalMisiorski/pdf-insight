"""Image-only PDFs for ADR-0009: the first 4 and 8 pages of T06 rendered to images (no text layer).
Usage: python eval/ocr/make_scans.py"""
from pathlib import Path

import fitz  # PyMuPDF

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "trainset" / "pdf" / "T06_regulamin_dlugi_pl.pdf"
OUT = HERE / "pdf"
OUT.mkdir(exist_ok=True)

src = fitz.open(SOURCE)
for count in (4, 8):
    scan = fitz.open()
    for number in range(count):
        page = src[number]
        image = scan.new_page(width=page.rect.width, height=page.rect.height)
        image.insert_image(image.rect, pixmap=page.get_pixmap(dpi=110))
    name = OUT / ("S%02d_regulamin_skan.pdf" % count)
    scan.save(name, deflate=True)
    print(name.name, count, "pages", round(name.stat().st_size / 1024), "KB")
