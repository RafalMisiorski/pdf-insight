"""A/B for ADR-0011: one call (A, forced locally) against the gate (H: the Worker decides, as in production),
on the fresh documents of set E. Usage: start `wrangler dev` with ALLOW_EXPERIMENTS=1 (see eval/dense/README.md),
then python eval/dense/run_hybrid.py. With --gate-only it only checks the gate's decisions, without the model."""
import json
import statistics
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
sys.path.insert(0, str(ROOT))
from grounding import source_text, ungrounded  # noqa: E402

API = "http://localhost:8787/analyze"
OUT = ROOT / "results" / "2026-10-09-tryb-dla-gestych"
DENSE = ROOT / "dense" / "pdf"
TRUTH = json.loads((ROOT / "dense" / "truth.json").read_text(encoding="utf-8"))
MEASURED = [DENSE / f"{name}.pdf" for name in ("E01_wyciag_rachunku", "E02_harmonogram_splaty", "E03_aneks_dostawy", "E04_kamienie_milowe")]
RUNS = 4
MIN_GAP_S = 6.5  # the Worker allows 10 requests a minute per IP
last_start = 0.0


def text_of(pdf):
    return "\n\n".join(page.extract_text() or "" for page in PdfReader(str(pdf)).pages)


def gate(texts):
    """The Worker's own function (worker/src/density.ts) run in Node on the same texts, without a model."""
    script = (
        "import { readFileSync } from 'node:fs'\n"
        f"import {{ wantsParallel }} from '{(REPO / 'worker' / 'src' / 'density.ts').as_uri()}'\n"
        "const texts = JSON.parse(readFileSync(process.argv.at(-1), 'utf8'))\n"
        "process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(texts).map(([k, v]) => [k, wantsParallel(v)]))))\n"
    )
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "texts.json"
        path.write_text(json.dumps(texts, ensure_ascii=False), encoding="utf-8")
        done = subprocess.run(["node", "--input-type=module", "-e", script, str(path)], capture_output=True, text=True, encoding="utf-8")
    if done.returncode != 0:
        sys.exit(done.stderr)
    return json.loads(done.stdout)


def gate_check():
    texts = {p.name: text_of(p) for p in sorted((ROOT / "trainset" / "pdf").glob("T0*.pdf"))}
    texts.update({p.name: text_of(p) for p in sorted(DENSE.glob("*.pdf"))})
    for p in sorted((ROOT / "longdoc").glob("pdf*/*.pdf")):
        text = text_of(p)
        for i in range(0, len(text), 400_000):  # fragments of at most 400k characters, as the app sends them
            texts[f"{p.name} [{i // 400_000 + 1}]"] = text[i:i + 400_000]
    decisions = gate(texts)
    expected = {name: name.startswith(("E01", "E02", "E03", "E04")) for name in decisions
                if name.startswith(("T0", "D01", "E0"))}
    wrong = [name for name, want in expected.items() if decisions[name] != want]
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "gate.json").write_text(json.dumps(decisions, ensure_ascii=False, indent=1), encoding="utf-8")
    for name, parallel in decisions.items():
        print(f"{'parallel' if parallel else 'one call':9} {name}{'  <- NOT AS EXPECTED' if name in wrong else ''}")
    return not wrong


def analyze(pdf, arm):
    global last_start
    reader = PdfReader(str(pdf))
    body = {"fileName": pdf.name, "pages": len(reader.pages), "text": text_of(pdf)}
    if arm == "A":
        body["mode"] = "single"
    time.sleep(max(0.0, last_start + MIN_GAP_S - time.time()))
    last_start = time.time()
    request = urllib.request.Request(API, data=json.dumps(body).encode(), method="POST",
                                     headers={"Content-Type": "application/json", "Origin": "http://localhost:5173"})
    started = time.time()
    try:
        with urllib.request.urlopen(request, timeout=60) as res:
            result = json.loads(res.read())["result"]
    except urllib.error.HTTPError as error:
        return time.time() - started, None, f"HTTP {error.code}"
    return time.time() - started, result, None


def found(result, truth):
    # Signs are compared without direction: a statement may print an outgoing payment or a debit balance as
    # a plain number, and the model may return it either way.
    values = [abs(a["value"]) for a in result["amounts"]]
    amounts = sum(1 for t in truth["amounts"] if any(abs(v - abs(t)) < 0.011 for v in values))
    return amounts, len(set(truth["dates"]) & {d["date"] for d in result["dates"]})


def score(row, pdf, result):
    row["ungrounded"] = len(ungrounded(result, *source_text(pdf))[1])
    truth = TRUTH[pdf.name]
    amounts, dates = found(result, truth)
    row.update({"amounts": f"{amounts}/{len(truth['amounts'])}", "dates": f"{dates}/{len(set(truth['dates']))}", "found": amounts + dates})


if "--rescore" in sys.argv:  # scores the saved answers again, without the model
    runs = json.loads((OUT / "runs.json").read_text(encoding="utf-8"))
    for row in runs:
        if not row["error"]:
            path = OUT / row["arm"] / f"{Path(row['doc']).stem}_r{row['run']}.json"
            score(row, DENSE / row["doc"], json.loads(path.read_text(encoding="utf-8")))
else:
    if not gate_check():
        sys.exit("The gate does not decide as expected: fix the counting before the measurement (ADR-0011).")
    if "--gate-only" in sys.argv:
        sys.exit(0)
    runs = []
    for pdf in MEASURED:
        for k in range(RUNS):
            for arm in (("A", "H") if k % 2 == 0 else ("H", "A")):
                seconds, result, error = analyze(pdf, arm)
                row = {"doc": pdf.name, "arm": arm, "run": k + 1, "s": round(seconds, 1), "error": error}
                if result:
                    (OUT / arm).mkdir(parents=True, exist_ok=True)
                    (OUT / arm / f"{pdf.stem}_r{k + 1}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
                    score(row, pdf, result)
                runs.append(row)
                print(json.dumps(row, ensure_ascii=False), flush=True)

(OUT / "runs.json").write_text(json.dumps(runs, ensure_ascii=False, indent=1), encoding="utf-8")
times = lambda arm: [r["s"] for r in runs if r["arm"] == arm and not r["error"]]
mean_found = lambda arm: statistics.mean(r["found"] for r in runs if r["arm"] == arm and "found" in r)
med_a, med_h = statistics.median(times("A")), statistics.median(times("H"))
rules = {
    "1 gate decides as expected": True,  # gate_check() runs before the model and is recorded in gate.json
    "2 median H at least 30% below A and max H <= 20 s": med_h <= 0.7 * med_a and max(times("H")) <= 20,
    "3 all H runs without error": all(not r["error"] for r in runs if r["arm"] == "H"),
    "4 quality not lower": mean_found("H") >= mean_found("A") - 2 and all(r.get("ungrounded", 1) == 0 for r in runs if r["arm"] == "H"),
}
print(f"\nmedian A {med_a:.1f} s, H {med_h:.1f} s ({med_h / med_a - 1:+.1%}); max A {max(times('A')):.1f} s, H {max(times('H')):.1f} s")
print(f"facts found (mean) A {mean_found('A'):.1f}, H {mean_found('H'):.1f}")
for name, ok in rules.items():
    print(("PASS " if ok else "FAIL ") + name)
print("DECISION:", "gate goes to production" if all(rules.values()) else "production stays at one call")
