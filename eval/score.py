"""Score PDF Insight outputs against the training labels, and check that every extracted fact is printed
in the source PDF (precision, eval/grounding.py; needs pypdf). Exits with 1 when any check fails.

Usage:
  npm run eval                              # Playwright uploads eval/trainset/pdf/* through the real UI
  python eval/score.py                      # compares eval-output/*.json with eval/trainset/labels
  python eval/score.py --outputs path/to/dir --labels path/to/labels
Each output file is the JSON downloaded from the app, named after the PDF (T01_faktura_pl.json for T01_faktura_pl.pdf).
A missing output counts as a failure. Recorded runs are in eval/results/.
Error cases (expect = error:...) are listed for a manual check of the UI message; they need no output file.
The company test PDF is not part of this repository and is never used for tuning: it is run once, at the end.
"""
import argparse
import json
import re
import sys
import unicodedata
from pathlib import Path

from grounding import source_text, ungrounded

HERE = Path(__file__).resolve().parent
TYPES = {"faktura", "umowa", "oferta", "raport", "inne"}
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def norm(s):
    s = unicodedata.normalize("NFKC", str(s)).lower()
    s = re.sub(r"[ \s]+", " ", s)
    return re.sub(r"[^\w ]", "", s).strip()


def digits(s):
    return re.sub(r"[\s ]", "", str(s))


def mentions(text, phrase):
    """True if the phrase occurs in the text as whole words. Numbers are compared without spaces
    ("6 150" matches "6150,00"), but only when the phrase has digits. Longer words may change their
    last two letters, because Polish inflects names ("przez Kwiaciarnię Pod Różą") and labels use stems
    ("szkole" for "szkolenia"); numbers and words of up to 3 letters must match exactly, so "zł" is not
    found inside "przyszły" and "2026" is not "2025"."""
    if any(ch.isdigit() for ch in phrase):
        number = re.escape(digits(phrase).lower())
        if re.search(r"(?<!\d)" + number + r"(?!\d)", digits(text).lower()):
            return True
    want, words = norm(phrase).split(), norm(text).split()

    def same(w, g):
        if not w.isalpha() or len(w) <= 3:
            return g == w
        return g.startswith(w[:max(4, len(w) - 2)])

    return any(all(same(w, g) for w, g in zip(want, words[i:i + len(want)])) for i in range(len(words) - len(want) + 1))


def structure_errors(o):
    """Structural check mirroring the brief's schema (keys may be added, never removed)."""
    e = []
    d = o.get("document")
    if not isinstance(d, dict):
        return ["document missing"]
    for k in ("fileName", "pages", "language", "type", "title", "date"):
        if k not in d:
            e.append("document.%s missing" % k)
    if d.get("type") not in TYPES:
        e.append("document.type not in enum: %r" % d.get("type"))
    if not (isinstance(d.get("language"), str) and re.fullmatch(r"[a-z]{2}", d["language"] or "")):
        e.append("document.language not ISO 639-1: %r" % d.get("language"))
    if d.get("date") is not None and not ISO_DATE.match(str(d.get("date"))):
        e.append("document.date not ISO 8601 or null: %r" % d.get("date"))
    if not isinstance(o.get("summary"), str):
        e.append("summary missing")
    for k in ("keyPoints", "amounts", "dates", "keywords"):
        if not isinstance(o.get(k), list):
            e.append("%s not a list" % k)
    ent = o.get("entities")
    if not (isinstance(ent, dict) and isinstance(ent.get("organizations"), list) and isinstance(ent.get("people"), list)):
        e.append("entities.organizations/people missing")
    for a in o.get("amounts") or []:
        if not (isinstance(a, dict) and isinstance(a.get("value"), (int, float)) and re.fullmatch(r"[A-Z]{3}", str(a.get("currency"))) and "context" in a):
            e.append("amount malformed: %r" % a)
    for x in o.get("dates") or []:
        if not (isinstance(x, dict) and ISO_DATE.match(str(x.get("date"))) and "context" in x):
            e.append("date item malformed: %r" % x)
    return e


# Same rule as the app (src/lib/sentences.ts): a dot ends a sentence only when the next word starts
# like a sentence and the word before is not an abbreviation that precedes a name ("ul.", "dr", "m.in.").
PREFIX_ABBREVIATIONS = {"ul", "al", "pl", "os", "woj", "nr", "tel", "ok", "np", "m.in", "tj", "tzw", "wg", "zob", "por",
                        "dr", "hab", "prof", "mgr", "inż", "mec", "adw", "ks", "red", "św", "im", "godz", "tys",
                        "art", "ust", "pkt", "lit", "poz", "par", "zał", "rozdz", "str", "tab", "rys", "dz",
                        "mr", "mrs", "ms", "no", "vs", "st", "approx", "sec", "e.g", "i.e", "cf"}
# The app counts caseless scripts (Japanese, Arabic...) with Intl.Segmenter; the training set is Polish and English.
TERMINAL = re.compile(r"[.!?][\"”')]?$")
STARTS = re.compile(r"^[\"„“'(¿¡]?[^\W\d_]|^[\"„“'(¿¡]?\d")


def count_sentences(text):
    words = text.split()
    count = 0
    for i, word in enumerate(words):
        if not TERMINAL.search(word):
            continue
        nxt = words[i + 1] if i + 1 < len(words) else None
        if nxt is None:
            count += 1
            continue
        if not STARTS.match(nxt) or (nxt[:1].isalpha() and not nxt[:1].isupper()) or (nxt[:1] in "\"„“'(" and nxt[1:2].isalpha() and not nxt[1:2].isupper()):
            continue
        core = re.sub(r"\.+$", "", re.sub(r"^[\"„“'(]+", "", word)).lower()
        closes_company_form = i > 0 and words[i - 1].lower() == "sp."  # "sp. j.", "sp. k." may end a sentence
        if word.endswith(".") and (core in PREFIX_ABBREVIATIONS or (len(core) == 1 and core.isalpha() and core != "r" and not closes_company_form)):
            continue
        count += 1
    if words and not TERMINAL.search(words[-1]):
        count += 1
    return count


def score(label, out):
    rows = []  # (check, ok, detail)
    se = structure_errors(out)
    rows.append(("schema", not se, "; ".join(se[:3])))
    d, ld = out.get("document") or {}, label["document"]
    for k in ("pages", "language", "type", "date"):
        if ld.get(k, "skip") != "skip":
            want = ld[k] if isinstance(ld[k], list) else [ld[k]]  # a list means several answers are acceptable
            rows.append(("document.%s" % k, d.get(k) in want, "got %r, want %r" % (d.get(k), ld[k])))
    rows.append(("document.title", norm(ld["title_contains"]) in norm(d.get("title") or ""), "got %r" % d.get("title")))
    summ = out.get("summary") or ""
    n = count_sentences(summ)
    lo, hi = label["summary"]["sentences"]
    rows.append(("summary.sentences", lo <= n <= hi, "%d sentences" % n))
    for m in label["summary"]["must_mention"]:
        rows.append(("summary mentions %r" % m, mentions(summ, m), ""))
    for m in label["summary"]["must_not"]:
        rows.append(("summary avoids %r" % m, not mentions(summ, m), ""))
    kp = len(out.get("keyPoints") or [])
    lo, hi = label["keyPoints"]["count"]
    rows.append(("keyPoints.count", lo <= kp <= hi, "%d items" % kp))
    ent = out.get("entities") or {}
    for kind in ("organizations", "people"):
        got = {norm(x) for x in ent.get(kind) or []}
        want = [norm(x) for x in label["entities"][kind]]
        hit = sum(1 for w in want if any(w in g or g in w for g in got))
        extra = [x for x in ent.get(kind) or [] if not any(norm(x) in w or w in norm(x) for w in want)]
        rows.append(("entities.%s recall" % kind, hit == len(want), "%d/%d; extra for review: %s" % (hit, len(want), extra[:3])))
    amts = [(float(a.get("value", 0)), str(a.get("currency"))) for a in out.get("amounts") or [] if isinstance(a, dict)]
    for a in label["amounts"]:
        rows.append(("amount %.2f %s" % (a["value"], a["currency"]), any(abs(v - a["value"]) < 0.011 and c == a["currency"] for v, c in amts), ""))
    for f in label["amounts_forbidden"]:
        ok = not amts if f == "any" else not any(abs(v - f) < 0.011 for v, _ in amts)
        rows.append(("no forbidden amount %s" % f, ok, "got %s" % amts[:3]))
    got_dates = {str(x.get("date")) for x in out.get("dates") or [] if isinstance(x, dict)}
    for dt in label["dates"]:
        rows.append(("date %s" % dt, dt in got_dates, ""))
    for f in label["dates_forbidden"]:
        rows.append(("no forbidden date %s" % f, not got_dates if f == "any" else f not in got_dates, "got %s" % sorted(got_dates)[:3]))
    return rows


# The Polish UI message that each expected error must show (src/lib/file.ts and src/App.tsx).
ERROR_MESSAGES = {"not_pdf": "nie jest", "too_large": "za duży", "no_text_layer": "warstwy tekstowej"}


# Checks that the app's own validation guarantees (an answer that fails them never reaches the user);
# they are reported apart from the measured ones, so they cannot inflate the measured result.
BY_CONSTRUCTION = {"schema", "summary.sentences", "keyPoints.count", "document.pages"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--labels", default=str(HERE / "trainset" / "labels"))
    ap.add_argument("--outputs", default=str(HERE.parent / "eval-output"))
    a = ap.parse_args()
    measured, construction, grounded = [0, 0], [0, 0], [0, 0]
    failed = False
    pdf_dir = Path(a.labels).parent / "pdf"
    # runs.json is written by the Playwright eval (npm run eval): the UI outcome of every uploaded file.
    runs_path = Path(a.outputs) / "runs.json"
    runs = json.loads(runs_path.read_text(encoding="utf-8")) if runs_path.exists() else {}
    for lp in sorted(Path(a.labels).glob("*.json")):
        label = json.loads(lp.read_text(encoding="utf-8"))
        if label["expect"] != "ok":
            run = runs.get(label["file"])
            if run is None:
                print("\n%s  %s -> check the UI by hand: %s" % (label["id"], label["file"], label["expect"]))
                continue
            kind = label["expect"].split(":", 1)[1]
            message = run.get("message") or ""
            passed = not run["ok"] and ERROR_MESSAGES[kind] in message
            measured[0] += passed
            measured[1] += 1
            failed |= not passed
            print("\n%s  %s  %d/1 checks (UI message: %r)" % (label["id"], label["file"], passed, message))
            continue
        op = Path(a.outputs) / (Path(label["file"]).stem + ".json")
        if not op.exists():
            print("\n%s  %s -> NO OUTPUT: counted as a failure (%s)" % (label["id"], label["file"], op))
            measured[1] += 1
            failed = True
            continue
        out = json.loads(op.read_text(encoding="utf-8"))
        rows = score(label, out)
        for name, passed, _ in rows:
            bucket = construction if name in BY_CONSTRUCTION else measured
            bucket[0] += passed
            bucket[1] += 1
        ok = sum(r[1] for r in rows)
        failed |= ok < len(rows)
        print("\n%s  %s  %d/%d checks" % (label["id"], label["file"], ok, len(rows)))
        for name, passed, detail in rows:
            if not passed:
                print("   FAIL %-34s %s" % (name, detail))
        # Precision: every extracted fact must be printed in the source PDF (a scan uses its text twin).
        source = pdf_dir / label.get("source_pdf", label["file"])
        if source.exists():
            checked, missing = ungrounded(out, *source_text(source))
            grounded[0] += checked - len(missing)
            grounded[1] += checked
            failed |= bool(missing)
            for item in missing:
                print("   NOT IN SOURCE %s" % item)
    pct = lambda pair: 100.0 * pair[0] / pair[1] if pair[1] else 100.0
    print("\nMEASURED label checks      %d/%d (%.0f%%)" % (measured[0], measured[1], pct(measured)))
    print("GROUNDED extracted facts   %d/%d (%.0f%%)  every amount, date, person, organization found in the PDF" % (grounded[0], grounded[1], pct(grounded)))
    print("BY CONSTRUCTION            %d/%d  (guaranteed by the app's validation, not a measurement)" % tuple(construction))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
