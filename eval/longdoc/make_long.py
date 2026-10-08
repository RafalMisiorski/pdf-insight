"""Synthetic long PDFs for ADR-0008: filler text without amounts, dates or names, plus three planted
facts (amount, date, person) at 5%, 50% and 95% of the length. Usage: python eval/longdoc/make_long.py"""
import json
import os
import random
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate

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
# Planted facts: different values at 5%, 50% and 95% of the text, so recall shows which positions survive.
FACTS = [
    ("Kara umowna za opóźnienie wynosi 1 234,00 zł.", 1234.00, "Termin odbioru pierwszego etapu to 15.03.2027 r.", "2027-03-15", "Osobą kontaktową po stronie Wykonawcy jest Zofia Krawczyk.", "Zofia Krawczyk"),
    ("Opłata za dodatkowy dzień wsparcia wynosi 2 345,00 zł.", 2345.00, "Przegląd półroczny odbędzie się 16.06.2027 r.", "2027-06-16", "Koordynatorem prac po stronie Zamawiającego jest Henryk Lewandowski.", "Henryk Lewandowski"),
    ("Wynagrodzenie za odbiór końcowy wynosi 3 456,00 zł.", 3456.00, "Umowa obowiązuje do 17.09.2027 r.", "2027-09-17", "Protokół odbioru podpisuje Irena Szymańska.", "Irena Szymańska"),
]


def build(target_chars):
    random.seed(target_chars)
    name = "L%03dk_dlugi_tekst.pdf" % (target_chars // 1000)
    paragraphs, length = [], 0
    while length < target_chars:
        text = " ".join(random.choice(FILLER) for _ in range(8))
        paragraphs.append(text)
        length += len(text) + 1
    for (fact_amount, _, fact_date, _, fact_person, _), share in zip(FACTS, (0.05, 0.50, 0.95)):
        i = int(len(paragraphs) * share)
        paragraphs[i] += " " + " ".join([fact_amount, fact_date, fact_person])
    story = [Paragraph("Warunki współpracy przy utrzymaniu systemu", H1)] + [Paragraph(t, P) for t in paragraphs]
    SimpleDocTemplate(str(OUT / name), pagesize=A4, leftMargin=20 * mm, rightMargin=20 * mm, topMargin=18 * mm, bottomMargin=18 * mm).build(story)
    return name, sum(len(t) for t in paragraphs)


if __name__ == "__main__":
    facts = {"amounts": [f[1] for f in FACTS], "dates": [f[3] for f in FACTS], "people": [f[5] for f in FACTS]}
    (HERE / "facts.json").write_text(json.dumps(facts, ensure_ascii=False, indent=1), encoding="utf-8")
    for size in (100_000, 200_000, 400_000):
        name, chars = build(size - 2_000)  # stay just under the 400k cap of the text path
        print(name, chars, "chars", round((OUT / name).stat().st_size / 1024), "KB")
