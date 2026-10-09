"""Precision check for the evaluation: every amount, date, person and organization in an output must be
printed in the source PDF. It catches invented facts that label checks cannot see, because a label lists
what must be found, not everything that may appear. Matching is lenient on purpose (formats, inflection,
spacing), so a miss means the fact is really not in the text. Needs pypdf: pip install pypdf."""
import re
import unicodedata

PL_MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września",
             "października", "listopada", "grudnia"]
EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
             "november", "december"]


def source_text(pdf_path):
    """The PDF text twice: without any whitespace (robust to extraction spacing) and with single spaces."""
    from pypdf import PdfReader  # imported here: only this check needs it

    text = "\n".join(page.extract_text() or "" for page in PdfReader(str(pdf_path)).pages)
    text = unicodedata.normalize("NFKC", text).lower()
    return re.sub(r"\s+", "", text), re.sub(r"\s+", " ", text)


def amount_printed(value, spaced):
    """The amount as printed: thousand groups may be split by a space, dot, comma or apostrophe
    ("4 200,00", "4.200,00", "4,200.00", "4200"), but never glued to another number from a
    neighbouring table cell ("1 | 2 400,00" is found, "12 400,00" does not contain 2 400).
    Known limitation: a space is both the Polish thousand separator and a cell separator, so the tail of a
    grouped number counts as printed ("150" in "6 150,00"). The check errs towards no false alarms."""
    whole, cents = divmod(round(abs(value) * 100), 100)
    groups = f"{whole:,}".split(",")
    integer = r"[\s.,']?".join(groups)
    decimals = r"[,.]%02d" % cents
    pattern = integer + (decimals if cents else "(?:" + decimals + ")?")
    if re.search(r"(?<![\d.,])" + pattern + r"(?![\d]|[\s.,'][\d]{3}(?!\d))", spaced):
        return True
    if abs(value) >= 1_000_000:  # "4,2 mln zł", "1.5 million"
        millions = re.escape(f"{abs(value) / 1_000_000:g}").replace(r"\.", "[.,]")
        return re.search(r"(?<![\d.,])" + millions + r"\s?(mln|million)", spaced) is not None
    return False


def date_printed(iso, compact):
    year, month, day = iso.split("-")
    d, m = int(day), int(month)
    pl, en = PL_MONTHS[m - 1], EN_MONTHS[m - 1]
    forms = {f"{day}.{month}.{year}", f"{d}.{month}.{year}", f"{year}-{month}-{day}", f"{day}/{month}/{year}",
             f"{d}{pl}{year}", f"{day}{pl}{year}", f"{d}{en}{year}", f"{en}{d},{year}"}
    return any(form in compact for form in forms)


def name_printed(name, compact):
    """Every word of the name, minus a possible Polish ending, occurs in the text ("Annę Kowalczyk")."""
    words = re.findall(r"\w+", name.lower())
    # Short words keep all but their last letter ("Ewa" in "Ewy"), longer ones all but two ("Grabowskiej").
    stems = [word[: len(word) - 2] if len(word) > 4 else word[: max(2, len(word) - 1)] for word in words]
    return all(stem in compact for stem in stems)


def ungrounded(output, compact, spaced):
    """Returns (number of checked items, list of items not found in the source text)."""
    items = []
    for a in output.get("amounts") or []:
        items.append((f"kwota {a.get('value')} {a.get('currency')}", amount_printed(float(a.get("value", 0)), spaced)))
    dates = [x.get("date") for x in output.get("dates") or []]
    if (output.get("document") or {}).get("date"):
        dates.append(output["document"]["date"])
    for iso in dates:
        items.append((f"data {iso}", bool(iso) and date_printed(iso, compact)))
    entities = output.get("entities") or {}
    for person in entities.get("people") or []:
        items.append((f"osoba {person}", name_printed(person, compact)))
    for org in entities.get("organizations") or []:
        first = (re.findall(r"\w+", org) or [""])[0]
        items.append((f"organizacja {org}", name_printed(first, compact)))
    return len(items), [name for name, ok in items if not ok]
