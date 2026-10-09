"""Fact-dense synthetic PDFs with every amount and date written to truth.json: set D for ADR-0010 (price
list, payment schedule, invoice ledger) and set E for ADR-0011 (fresh genres, generated before that measurement). Genres chosen to differ from the company test document (a framework
contract). Usage: python eval/dense/make_dense.py"""
import datetime as dt
import json
import os
import random
from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

HERE = Path(__file__).resolve().parent
OUT = HERE / "pdf"
OUT.mkdir(exist_ok=True)
FONTS = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
pdfmetrics.registerFont(TTFont("Body", str(FONTS / "arial.ttf")))
pdfmetrics.registerFont(TTFont("Bold", str(FONTS / "arialbd.ttf")))
H1 = ParagraphStyle("h1", fontName="Bold", fontSize=15, leading=19, spaceAfter=8)
P = ParagraphStyle("p", fontName="Body", fontSize=10, leading=14, spaceAfter=5)


def money(value):  # 12345.5 -> "12 345,50"
    whole, cents = f"{value:.2f}".split(".")
    return f"{int(whole):,}".replace(",", " ") + "," + cents


def pl_date(day):
    return day.strftime("%d.%m.%Y")


def table(rows, widths):
    t = Table(rows, colWidths=[w * mm for w in widths], repeatRows=1)
    t.setStyle(TableStyle([("FONTNAME", (0, 0), (-1, -1), "Body"), ("FONTNAME", (0, 0), (-1, 0), "Bold"),
                           ("FONTSIZE", (0, 0), (-1, -1), 9), ("GRID", (0, 0), (-1, -1), 0.4, "#999999")]))
    return t


def build(name, story):
    SimpleDocTemplate(str(OUT / name), pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm,
                      topMargin=16 * mm, bottomMargin=16 * mm).build(story)


truth = {}
random.seed(1010)

# D01 price list: 36 services with distinct prices
services = ["Przegląd okresowy", "Wymiana filtrów", "Kalibracja czujników", "Diagnostyka zdalna", "Serwis awaryjny",
            "Aktualizacja oprogramowania", "Szkolenie operatora", "Audyt instalacji", "Czyszczenie wymienników",
            "Dojazd serwisanta", "Dyżur weekendowy", "Montaż modułu", "Demontaż urządzenia", "Raport techniczny"]
prices = sorted(random.sample(range(9000, 1_250_000), 36))
rows, amounts = [["Lp.", "Usługa", "Cena netto"]], []
for i, cents in enumerate(prices, 1):
    value = cents / 100
    rows.append([str(i), f"{random.choice(services)} (wariant {i})", money(value) + " zł"])
    amounts.append(value)
dates = ["2025-12-15", "2026-01-01", "2026-12-31", "2026-07-01"]
build("D01_cennik_uslug.pdf", [
    Paragraph("CENNIK USŁUG SERWISOWYCH NA ROK 2026", H1),
    Paragraph("Serwis Orion sp. z o.o., ul. Portowa 8, 70-602 Szczecin. Data publikacji: 15.12.2025 r.", P),
    Paragraph("Cennik obowiązuje od 01.01.2026 r. do 31.12.2026 r. Najbliższa rewizja cen: 01.07.2026 r.", P),
    Spacer(1, 3 * mm), table(rows, [12, 110, 40]),
])
truth["D01_cennik_uslug.pdf"] = {"amounts": amounts, "dates": dates}

# D02 payment schedule: 24 milestones, each with a date and an amount
start = dt.date(2027, 1, 15)
rows, amounts, dates = [["Etap", "Zakres", "Termin", "Kwota netto"]], [], ["2026-11-20"]
for i in range(1, 25):
    day = start + dt.timedelta(days=21 * i + random.randint(0, 6))
    value = random.randint(1_500_000, 48_000_000) / 100
    rows.append([f"E{i}", f"Etap robót nr {i}", pl_date(day), money(value) + " zł"])
    amounts.append(value)
    dates.append(day.isoformat())
build("D02_harmonogram_platnosci.pdf", [
    Paragraph("HARMONOGRAM RZECZOWO-FINANSOWY: HALA MAGAZYNOWA KĘPNO", H1),
    Paragraph("Inwestor: Hala Logistyczna Kępno sp. z o.o. Wykonawca: Budowa Mazur S.A. Harmonogram z dnia 20.11.2026 r.", P),
    Spacer(1, 3 * mm), table(rows, [14, 70, 34, 44]),
])
truth["D02_harmonogram_platnosci.pdf"] = {"amounts": amounts, "dates": dates}

# D03 invoice ledger: 28 invoices with issue date, due date and gross amount
rows, amounts, dates = [["Nr faktury", "Kontrahent", "Wystawiona", "Termin", "Brutto"]], [], []
clients = ["Delta Trans", "Mewa Logistics", "Opal Foods", "Rydwan Auto", "Sigma Druk", "Tęcza Media"]
for i in range(1, 29):
    issued = dt.date(2026, 7, 1) + dt.timedelta(days=3 * i)
    due = issued + dt.timedelta(days=random.choice([14, 21, 30]))
    value = random.randint(80_000, 9_500_000) / 100
    rows.append([f"FV/2026/Q3/{i:03d}", random.choice(clients) + " sp. z o.o.", pl_date(issued), pl_date(due), money(value) + " zł"])
    amounts.append(value)
    dates += [issued.isoformat(), due.isoformat()]
build("D03_zestawienie_faktur.pdf", [
    Paragraph("ZESTAWIENIE FAKTUR SPRZEDAŻY ZA III KWARTAŁ 2026", H1),
    Paragraph("Sporządził dział księgowości Biura Rachunkowego Kwadryga sp. j.", P),
    Spacer(1, 3 * mm), table(rows, [32, 50, 26, 26, 30]),
])
truth["D03_zestawienie_faktur.pdf"] = {"amounts": amounts, "dates": sorted(set(dates))}

# Set E for ADR-0011: fresh genres, densities from the gate threshold up, its own random source so that
# set D above stays exactly as measured in ADR-0010.
rng = random.Random(2011)

# E01 business account statement: 32 transactions on distinct days, opening and closing balance
start = dt.date(2026, 8, 1)
opening = 48_250.00
balance = opening
rows, amounts, dates = [["Data", "Kontrahent i tytuł", "Wpływ", "Wydatek"]], [opening], ["2026-08-01", "2026-09-30", "2026-10-01"]
partners = ["Delta Trans sp. z o.o.", "ZUS", "Urząd Skarbowy", "Mewa Logistics sp. z o.o.", "Opal Foods S.A.", "Najem biura"]
for offset in sorted(rng.sample(range(61), 32)):
    day = start + dt.timedelta(days=offset)
    value = rng.randint(15_000, 2_800_000) / 100
    income = rng.random() < 0.45
    balance += value if income else -value
    rows.append([pl_date(day), rng.choice(partners), money(value) + " zł" if income else "", "" if income else money(value) + " zł"])
    amounts.append(value)
    dates.append(day.isoformat())
amounts.append(round(balance, 2))
build("E01_wyciag_rachunku.pdf", [
    Paragraph("WYCIĄG Z RACHUNKU FIRMOWEGO NR 9/2026", H1),
    Paragraph("Posiadacz: Pracownia Tekstu Mazur sp. z o.o. Okres: 01.08.2026–30.09.2026. Data wyciągu: 01.10.2026.", P),
    Paragraph(f"Saldo początkowe: {money(opening)} zł. Saldo końcowe: {money(round(balance, 2))} zł.", P),
    Spacer(1, 3 * mm), table(rows, [24, 78, 30, 30]),
])
truth["E01_wyciag_rachunku.pdf"] = {"amounts": amounts, "dates": sorted(set(dates))}

# E02 loan repayment schedule with decreasing instalments: 18 instalments, each a different amount (only the
# instalment is printed, so the document stays near the gate threshold, as planned in ADR-0011)
loan, principal, rate = 180_000.00, 10_000.00, 0.0075
rows, amounts, dates = [["Rata", "Termin", "Kwota raty"]], [loan], ["2026-10-20"]
remaining, interest_total = loan, 0.0
for i in range(18):
    due = dt.date(2026 + (10 + i) // 12, (10 + i) % 12 + 1, 15)
    interest = round(remaining * rate, 2)
    interest_total += interest
    rows.append([str(i + 1), pl_date(due), money(principal + interest) + " zł"])
    amounts.append(round(principal + interest, 2))
    dates.append(due.isoformat())
    remaining -= principal
amounts.append(round(interest_total, 2))
build("E02_harmonogram_splaty.pdf", [
    Paragraph("HARMONOGRAM SPŁATY POŻYCZKI NR P/118/2026", H1),
    Paragraph(f"Umowa pożyczki z dnia 20.10.2026 r. Kwota pożyczki: {money(loan)} zł, raty malejące, oprocentowanie 9% w skali roku.", P),
    Spacer(1, 3 * mm), table(rows, [20, 40, 50]),
    Spacer(1, 3 * mm), Paragraph(f"Suma odsetek: {money(round(interest_total, 2))} zł.", P),
])
truth["E02_harmonogram_splaty.pdf"] = {"amounts": amounts, "dates": sorted(set(dates))}

# E03 contract annex with a delivery schedule: 40 deliveries, a date and a value each
day = dt.date(2026, 10, 15)
rows, amounts, dates = [["Dostawa", "Termin", "Asortyment", "Wartość netto"]], [], ["2025-03-03", "2026-10-01"]
goods = ["kable YKY", "rozdzielnice", "oprawy LED", "korytka kablowe", "aparatura modułowa", "osprzęt"]
for i in range(40):
    day += dt.timedelta(days=rng.randint(4, 6))
    value = rng.randint(250_000, 9_500_000) / 100
    rows.append([f"D{i + 1}", pl_date(day), rng.choice(goods), money(value) + " zł"])
    amounts.append(value)
    dates.append(day.isoformat())
amounts.append(round(sum(amounts), 2))
build("E03_aneks_dostawy.pdf", [
    Paragraph("ANEKS NR 3 DO UMOWY DOSTAWY NR 12/2025", H1),
    Paragraph("Zawarty 01.10.2026 r. do umowy z dnia 03.03.2025 r. między Elektro-Hurt Kalisz sp. z o.o. a Budimex-Instal Poznań sp. z o.o.", P),
    Paragraph("Strony ustalają nowy harmonogram dostaw:", P),
    Spacer(1, 3 * mm), table(rows, [20, 30, 70, 40]),
    Spacer(1, 3 * mm), Paragraph(f"Łączna wartość dostaw według aneksu: {money(amounts[-1])} zł netto.", P),
])
truth["E03_aneks_dostawy.pdf"] = {"amounts": amounts, "dates": sorted(set(dates))}

# E04 project milestone settlement: 25 milestones, an acceptance date and a payment each
day = dt.date(2026, 3, 2)
rows, amounts, dates = [["Etap", "Odbiór", "Zakres", "Płatność"]], [], ["2026-03-02", "2028-01-31", "2026-10-05"]
scopes = ["analiza", "konfiguracja", "migracja danych", "testy", "szkolenia", "integracja"]
for i in range(25):
    day += dt.timedelta(days=rng.randint(18, 26))
    value = rng.randint(1_800_000, 26_000_000) / 100
    rows.append([f"M{i + 1}", pl_date(day), rng.choice(scopes), money(value) + " zł"])
    amounts.append(value)
    dates.append(day.isoformat())
amounts.append(round(sum(amounts), 2))
build("E04_kamienie_milowe.pdf", [
    Paragraph("ROZLICZENIE ETAPÓW PROJEKTU: WDROŻENIE SYSTEMU ERP", H1),
    Paragraph("Zamawiający: Mleczarnia Podlaska S.A. Wykonawca: Kod i Proces sp. z o.o. Projekt od 02.03.2026 do 31.01.2028. Stan na 05.10.2026.", P),
    Spacer(1, 3 * mm), table(rows, [16, 30, 74, 40]),
    Spacer(1, 3 * mm), Paragraph(f"Wartość umowy: {money(amounts[-1])} zł netto.", P),
])
truth["E04_kamienie_milowe.pdf"] = {"amounts": amounts, "dates": sorted(set(dates))}

# E05 spare-parts catalogue: 45 prices and only two dates, so the gate keeps one call
rows, amounts = [["Nr katalogowy", "Część", "Cena netto"]], []
parts = ["filtr oleju", "pasek klinowy", "łożysko", "uszczelka", "czujnik ciśnienia", "zawór", "pompa"]
for cents in sorted(rng.sample(range(1_500, 950_000), 45)):
    rows.append([f"CZ-{rng.randint(1000, 9999)}", rng.choice(parts), money(cents / 100) + " zł"])
    amounts.append(cents / 100)
build("E05_katalog_czesci.pdf", [
    Paragraph("KATALOG CZĘŚCI ZAMIENNYCH 2027", H1),
    Paragraph("Agromasz Serwis sp. z o.o. Data publikacji: 15.10.2026 r. Ceny obowiązują od 01.11.2026 r.", P),
    Spacer(1, 3 * mm), table(rows, [36, 86, 40]),
])
truth["E05_katalog_czesci.pdf"] = {"amounts": amounts, "dates": ["2026-10-15", "2026-11-01"]}

(HERE / "truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=1), encoding="utf-8")
for name, t in truth.items():
    print(name, len(t["amounts"]), "amounts,", len(t["dates"]), "dates")
