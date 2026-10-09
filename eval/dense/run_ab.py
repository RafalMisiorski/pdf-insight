"""A/B for ADR-0010: one call (A) against three parallel field groups (B), on the local Worker with the same
text for both arms. Usage: start `wrangler dev` (see eval/dense/README), then python eval/dense/run_ab.py"""
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from grounding import source_text, ungrounded  # noqa: E402
from score import score  # noqa: E402

API = "http://localhost:8787/analyze"
OUT = ROOT / "results" / "2026-10-09-rownolegle"
TRUTH = json.loads((ROOT / "dense" / "truth.json").read_text(encoding="utf-8"))
DENSE = [ROOT / "dense" / "pdf" / name for name in sorted(TRUTH)]
LABELED = [p for p in sorted((ROOT / "trainset" / "pdf").glob("T0*.pdf")) if not p.name.startswith("T08")]
MIN_GAP_S = 6.5  # the Worker allows 10 requests a minute per IP
last_start = 0.0


def analyze(pdf, arm):
    global last_start
    text = "\n\n".join(page.extract_text() or "" for page in PdfReader(str(pdf)).pages)
    body = {"fileName": pdf.name, "pages": len(PdfReader(str(pdf)).pages), "text": text}
    if arm == "B":
        body["mode"] = "parallel"
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


def recall(values, truth_values):
    return sum(1 for t in truth_values if any(abs(v - t) < 0.011 for v in values))


runs = []
for pdf in DENSE + LABELED:
    for k in range(3 if pdf in DENSE else 1):
        for arm in (("A", "B") if k % 2 == 0 else ("B", "A")):
            seconds, result, error = analyze(pdf, arm)
            row = {"doc": pdf.name, "arm": arm, "run": k + 1, "s": round(seconds, 1), "error": error}
            if result:
                (OUT / arm).mkdir(parents=True, exist_ok=True)
                (OUT / arm / f"{pdf.stem}_r{k + 1}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
                checked, missing = ungrounded(result, *source_text(pdf))
                row["ungrounded"] = len(missing)
                if pdf in DENSE:
                    t = TRUTH[pdf.name]
                    row["amounts"] = f"{recall([a['value'] for a in result['amounts']], t['amounts'])}/{len(t['amounts'])}"
                    row["dates"] = f"{len(set(t['dates']) & {d['date'] for d in result['dates']})}/{len(t['dates'])}"
                    row["found"] = recall([a["value"] for a in result["amounts"]], t["amounts"]) + len(set(t["dates"]) & {d["date"] for d in result["dates"]})
                else:
                    label = json.loads((ROOT / "trainset" / "labels" / (pdf.stem + ".json")).read_text(encoding="utf-8"))
                    rows = score(label, result)
                    row["checks"] = f"{sum(r[1] for r in rows)}/{len(rows)}"
                    row["passed"] = sum(r[1] for r in rows)
            runs.append(row)
            print(json.dumps(row, ensure_ascii=False), flush=True)

(OUT / "runs.json").write_text(json.dumps(runs, ensure_ascii=False, indent=1), encoding="utf-8")
times = lambda arm, dense: [r["s"] for r in runs if r["arm"] == arm and (r["doc"].startswith("D") == dense) and not r["error"]]
found = lambda arm: statistics.mean(r["found"] for r in runs if r["arm"] == arm and "found" in r)
passed = lambda arm: sum(r.get("passed", 0) for r in runs if r["arm"] == arm and r["doc"].startswith("T"))
med_a, med_b = statistics.median(times("A", True)), statistics.median(times("B", True))
rules = {
    "1 median dense -30% and max B <= 20 s": med_b <= 0.7 * med_a and max(times("B", True)) <= 20,
    "2 all B runs without error": all(not r["error"] for r in runs if r["arm"] == "B"),
    "3 quality not lower": passed("B") >= passed("A") and all(r.get("ungrounded", 0) == 0 for r in runs if r["arm"] == "B") and found("B") >= found("A") - 2,
    "4 T-docs median B <= A + 2 s": statistics.median(times("B", False)) <= statistics.median(times("A", False)) + 2,
}
print(f"\ndense median A {med_a:.1f} s, B {med_b:.1f} s; max A {max(times('A', True)):.1f} s, B {max(times('B', True)):.1f} s")
print(f"T-docs median A {statistics.median(times('A', False)):.1f} s, B {statistics.median(times('B', False)):.1f} s; label checks A {passed('A')}, B {passed('B')}")
print(f"dense facts found (mean) A {found('A'):.1f}, B {found('B'):.1f}")
for name, ok in rules.items():
    print(("PASS " if ok else "FAIL ") + name)
print("DECISION:", "adopt B" if all(rules.values()) else "keep A")
