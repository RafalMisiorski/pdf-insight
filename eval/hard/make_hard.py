"""Documents at the edge of one analysis for ADR-0012: text, scanned and mixed PDFs of known size, each with
planted facts (an amount, a date and a person) at the start, middle and end of its text part and of its
scanned part. Scanned pages are JPEG images of text pages, without a text layer. truth.json keeps the planted
facts and the full text of every document, for the check that no fact comes from outside it.
Usage: python eval/hard/make_hard.py"""
import datetime as dt
import io
import json
import os
import random
from pathlib import Path

import fitz  # PyMuPDF
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import PageBreak, Paragraph, SimpleDocTemplate

HERE = Path(__file__).resolve().parent
OUT = HERE / "pdf"
OUT.mkdir(exist_ok=True)
FONTS = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
pdfmetrics.registerFont(TTFont("Body", str(FONTS / "arial.ttf")))
P = ParagraphStyle("p", fontName="Body", fontSize=10, leading=14, spaceAfter=5)
H1 = ParagraphStyle("h1", fontName="Body", fontSize=15, leading=19, spaceAfter=8)
FILLER = [
    "Strony ustalają zasady współpracy przy utrzymaniu systemu informatycznego.",
    "Wykonawca prowadzi dokumentację prac i udostępnia ją Zamawiającemu na żądanie.",
    "Zgłoszenia awarii przyjmowane są przez panel obsługi klienta.",
    "Zamawiający zapewnia dostęp do środowiska testowego w uzgodnionym zakresie.",
    "Zmiany w zakresie prac wymagają akceptacji obu stron w formie pisemnej.",
    "Wykonawca informuje o planowanych pracach serwisowych z odpowiednim wyprzedzeniem.",
    "Strony współpracują w dobrej wierze i niezwłocznie wyjaśniają wątpliwości.",
    "Kopie zapasowe są wykonywane regularnie i przechowywane w bezpiecznej lokalizacji.",
]
PEOPLE = ["Zofia Krawczyk", "Henryk Lewandowski", "Irena Szymańska", "Marek Zieliński", "Anna Wójcik",
          "Tomasz Kowalczyk", "Ewa Kamińska", "Jan Mazur", "Piotr Nowicki", "Karolina Duda", "Adam Pawlak",
          "Beata Sikora"]


def money(value):
    whole, cents = f"{value:.2f}".split(".")
    return f"{int(whole):,}".replace(",", " ") + "," + cents


def planted(rng, people, where):
    """Three facts, one sentence each, for the start, middle and end of one part of a document."""
    facts = []
    for person in people:
        amount = rng.randint(10_000, 9_999_999) / 100
        day = dt.date(2027, rng.randint(1, 12), rng.randint(1, 28))
        sentence = (f"Ustalenie ({where}): opłata wynosi {money(amount)} zł, termin płatności to "
                    f"{day.strftime('%d.%m.%Y')} r., a odpowiada za nią {person}.")
        facts.append({"amount": amount, "date": day.isoformat(), "person": person, "sentence": sentence, "part": where})
    return facts


def filler(rng, chars):
    paragraphs, length = [], 0
    while length < chars:
        text = " ".join(rng.choice(FILLER) for _ in range(8))
        paragraphs.append(text)
        length += len(text) + 1
    return paragraphs


def pdf_bytes(story):
    buffer = io.BytesIO()
    SimpleDocTemplate(buffer, pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm,
                      bottomMargin=18 * mm).build(story)
    return buffer.getvalue()


def text_part(rng, chars, facts):
    paragraphs = filler(rng, chars)
    for fact, share in zip(facts, (0.05, 0.50, 0.95)):
        index = min(len(paragraphs) - 1, int(len(paragraphs) * share))
        paragraphs[index] += " " + fact["sentence"]
    story = [Paragraph("Warunki współpracy przy utrzymaniu systemu", H1)] + [Paragraph(t, P) for t in paragraphs]
    return pdf_bytes(story), "Warunki współpracy przy utrzymaniu systemu\n" + "\n".join(paragraphs)


def scan_part(rng, pages, facts):
    """`pages` pages of about 2000 characters each, facts on the first, middle and last page, as images."""
    texts = [filler(rng, 2_000) for _ in range(pages)]
    for fact, page in zip(facts, (0, pages // 2, pages - 1)):
        texts[page][0] = fact["sentence"] + " " + texts[page][0]
    story = []
    for number, paragraphs in enumerate(texts):
        story += [Paragraph(f"Załącznik, strona {number + 1}", H1)] + [Paragraph(t, P) for t in paragraphs]
        if number < pages - 1:
            story.append(PageBreak())
    source = fitz.open(stream=pdf_bytes(story), filetype="pdf")
    assert source.page_count == pages, (source.page_count, pages)
    scan = fitz.open()
    for page in source:
        jpeg = page.get_pixmap(dpi=120).tobytes("jpeg", jpg_quality=55)
        image_page = scan.new_page(width=page.rect.width, height=page.rect.height)
        image_page.insert_image(image_page.rect, stream=jpeg)
    text = "\n".join(f"Załącznik, strona {n + 1}\n" + "\n".join(t) for n, t in enumerate(texts))
    return scan, text


def build(name, text_chars=0, scan_pages=0):
    rng = random.Random(name)
    people = iter(rng.sample(PEOPLE, 6))
    doc, texts, facts = fitz.open(), [], []
    if text_chars:
        part_facts = planted(rng, [next(people) for _ in range(3)], "tekst")
        data, text = text_part(rng, text_chars, part_facts)
        doc.insert_pdf(fitz.open(stream=data, filetype="pdf"))
        texts.append(text)
        facts += part_facts
    if scan_pages:
        part_facts = planted(rng, [next(people) for _ in range(3)], "skan")
        scan, text = scan_part(rng, scan_pages, part_facts)
        doc.insert_pdf(scan)
        texts.append(text)
        facts += part_facts
    path = OUT / name
    doc.save(path, deflate=True)
    size_mb = path.stat().st_size / 1_000_000
    assert size_mb < 10, (name, size_mb)
    print(f"{name}: {doc.page_count} pages, {size_mb:.1f} MB, text {text_chars} chars, scan {scan_pages} pages")
    return {"facts": facts, "text": "\n".join(texts), "pages": doc.page_count, "text_chars": text_chars,
            "scan_pages": scan_pages, "mb": round(size_mb, 1)}


LADDER = {  # name -> (characters of text, scanned pages); parts: 400k characters or 8 pages each
    "S016_skan.pdf": (0, 16),
    "T1550k_tekst.pdf": (1_550_000, 0),
    "S032_skan.pdf": (0, 32),
    "M0380k_S024_mieszany.pdf": (380_000, 24),
    "T2320k_tekst.pdf": (2_320_000, 0),
    "S048_skan.pdf": (0, 48),
    "M0380k_S040_mieszany.pdf": (380_000, 40),
}
truth = {name: build(name, *sizes) for name, sizes in LADDER.items()}
(HERE / "truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=1), encoding="utf-8")
