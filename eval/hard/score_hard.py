"""Scores the ADR-0012 ladder: for every document and run, the time from choosing the file to the result,
the planted facts found and the facts not in the document, then the rule of ADR-0012.
Usage: python eval/hard/score_hard.py eval/results/2026-10-09-planer/run1 eval/results/2026-10-09-planer/run2"""
import json
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from grounding import ungrounded  # noqa: E402

TRUTH = json.loads((ROOT / "hard" / "truth.json").read_text(encoding="utf-8"))
PARTS = {  # parts per document, from the plan of ADR-0012
    "S016_skan.pdf": 2, "T1550k_tekst.pdf": 4, "S032_skan.pdf": 4, "M0380k_S024_mieszany.pdf": 4,
    "T2320k_tekst.pdf": 6, "S048_skan.pdf": 6, "M0380k_S040_mieszany.pdf": 6,
}
LIMIT_MS = 30_000


def normalized(text):
    text = unicodedata.normalize("NFKC", text).lower()
    return re.sub(r"\s+", "", text), re.sub(r"\s+", " ", text)


def found(result, facts):
    amounts = [abs(a["value"]) for a in result["amounts"]]
    dates = {d["date"] for d in result["dates"]}
    people = {p.lower() for p in result["entities"]["people"]}
    hits = 0
    for fact in facts:
        hits += any(abs(v - fact["amount"]) < 0.011 for v in amounts)
        hits += fact["date"] in dates
        hits += fact["person"].lower() in people
    return hits, 3 * len(facts)


rows, passed = [], {}
for run_dir in map(Path, sys.argv[1:]):
    runs = json.loads((run_dir / "runs.json").read_text(encoding="utf-8"))
    for name, truth in TRUTH.items():
        run = runs.get(name, {"ok": False, "ms": 0, "message": "missing"})
        row = {"doc": name, "run": run_dir.name, "parts": PARTS[name], "s": round(run["ms"] / 1000, 1), "ok": run["ok"]}
        if run["ok"]:
            result = json.loads((run_dir / name.replace(".pdf", ".json")).read_text(encoding="utf-8"))
            hits, total = found(result, truth["facts"])
            row.update({"facts": f"{hits}/{total}", "outside": len(ungrounded(result, *normalized(truth["text"]))[1]),
                        "skipped": len((result.get("meta") or {}).get("pagesSkipped", [])),
                        "failed": len((result.get("meta") or {}).get("pagesFailed", []))})
            good = run["ms"] <= LIMIT_MS and hits >= 0.8 * total and row["outside"] == 0
        else:
            row["message"] = run.get("message", "")
            good = False
        passed[name] = passed.get(name, True) and good
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False))

level = lambda k: all(passed[n] for n, parts in PARTS.items() if parts == k)
max_parts = 6 if level(4) and level(6) else 4 if level(4) else 2 if passed["S016_skan.pdf"] else 0
print("\nsteps passed:", {n: ok for n, ok in passed.items()})
print("MAX_PARTS by the rule:", max_parts or "no planner")
