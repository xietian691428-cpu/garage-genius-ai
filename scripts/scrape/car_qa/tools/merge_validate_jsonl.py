#!/usr/bin/env python3
"""
Merge / validate owner-reviews.jsonl after a harvest+clean round.

  ./run.sh merge
  python tools/merge_validate_jsonl.py ../../data/owner-reviews.jsonl
  python tools/merge_validate_jsonl.py ../../data/owner-reviews.jsonl --write-deduped

Checks:
  - total Q&A rows
  - duplicate ids / near-duplicate questions
  - category distribution (maintenance / safety emphasis)
  - coverage for priority US models (Group1 + hot Group2)
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter, defaultdict
from pathlib import Path

PRIORITY_MODELS = [
    ("Toyota", "RAV4"),
    ("Ford", "F-150"),
    ("Honda", "CR-V"),
    ("Chevrolet", "Silverado"),
    ("Kia", "Telluride"),
    ("Ram", "1500"),
    ("Tesla", "Model Y"),
    ("Jeep", "Wrangler"),
    ("Subaru", "Outback"),
    ("Hyundai", "Tucson"),
    ("BMW", "X5"),
    ("Mercedes-Benz", "GLE"),
    ("Audi", "Q5"),
    ("Lexus", "RX"),
    ("Volvo", "XC90"),
    ("Porsche", "Cayenne"),
    ("Genesis", "GV80"),
]

FOCUS_CATEGORIES = ("maintenance", "safety", "reliability", "powertrain", "fuel_economy")


def norm_q(q: str) -> str:
    s = re.sub(r"\s+", " ", (q or "").lower()).strip()
    s = re.sub(r"[^a-z0-9 ]+", "", s)
    return s[:160]


def load_rows(path: Path) -> list[dict]:
    rows: list[dict] = []
    for i, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        line = line.strip()
        if not line:
            continue
        try:
            rows.append(json.loads(line))
        except json.JSONDecodeError:
            print(f"! JSON error on line {i}")
    return rows


def print_stats_table(cats: Counter, total: int) -> None:
    """ASCII bar chart + markdown-ish table for category balance."""
    if not total:
        print("(empty corpus)")
        return
    print("=== --stats: category distribution ===")
    print(f"{'category':<22} {'count':>6} {'pct':>7}  bar")
    print("-" * 64)
    width = 28
    for cat, n in cats.most_common():
        pct = 100.0 * n / total
        bar_len = max(1, int(round(pct / 100.0 * width))) if n else 0
        bar = "█" * bar_len
        mark = " *" if cat in FOCUS_CATEGORIES else ""
        print(f"{cat:<22} {n:>6} {pct:>6.1f}%  {bar}{mark}")
    print("-" * 64)
    maint = cats.get("maintenance", 0)
    safety = cats.get("safety", 0)
    coach = sum(cats.get(c, 0) for c in ("maintenance", "reliability", "fuel_economy"))
    print(
        f"balance  maintenance {100*maint/total:.1f}%  |  safety {100*safety/total:.1f}%  |  "
        f"coach-mix {100*coach/total:.1f}%"
    )
    # Compact "pie" as stacked proportion line
    pie_parts = []
    for cat, n in cats.most_common(6):
        pie_parts.append(f"{cat[0:4]}:{100*n/total:.0f}%")
    print("pie(top6) " + " · ".join(pie_parts))
    print()


def main() -> int:
    ap = argparse.ArgumentParser(description="Validate / dedupe owner-reviews.jsonl")
    ap.add_argument(
        "path",
        nargs="?",
        default=str(
            Path(__file__).resolve().parents[2] / "data" / "owner-reviews.jsonl"
        ),
    )
    ap.add_argument(
        "--write-deduped",
        action="store_true",
        help="Rewrite file keeping first occurrence of each id",
    )
    ap.add_argument(
        "--stats",
        action="store_true",
        help="Print category distribution table + ASCII bar/pie summary",
    )
    ap.add_argument(
        "--min-coach-mix-pct",
        type=float,
        default=40.0,
        help="Warn if maintenance+reliability+fuel_economy share is below this %%",
    )
    ap.add_argument(
        "--min-maintenance-pct",
        type=float,
        default=12.0,
        help="Warn if maintenance share is below this %%",
    )
    ap.add_argument(
        "--min-safety-pct",
        type=float,
        default=10.0,
        help="Warn if safety share is below this %%",
    )
    args = ap.parse_args()
    path = Path(args.path)
    if not path.is_file():
        print(f"Missing: {path}")
        return 1

    rows = load_rows(path)
    total = len(rows)
    ids = [r.get("id") for r in rows if r.get("id")]
    id_counts = Counter(ids)
    dup_ids = {i: n for i, n in id_counts.items() if n > 1}

    # question near-dupes (same brand+model+norm question)
    q_keys: Counter = Counter()
    for r in rows:
        key = f"{r.get('brand')}|{r.get('model')}|{norm_q(r.get('question') or '')}"
        if key.endswith("|"):
            continue
        q_keys[key] += 1
    near_dupes = sum(1 for n in q_keys.values() if n > 1)

    cats = Counter((r.get("category") or "unknown").lower() for r in rows)
    brands = Counter(r.get("brand") or "?" for r in rows)

    if args.stats:
        print_stats_table(cats, total)

    print("=== Owner-reviews merge validation ===")
    print(f"file: {path}")
    print(f"total Q&A rows: {total}")
    print(f"unique ids: {len(id_counts)}  duplicate id rows: {sum(n-1 for n in dup_ids.values())}")
    print(f"near-duplicate questions (brand+model+q): {near_dupes}")
    print()
    if not args.stats:
        print("category distribution:")
        for cat, n in cats.most_common():
            pct = 100.0 * n / total if total else 0
            mark = " ← focus" if cat in FOCUS_CATEGORIES else ""
            print(f"  {n:5d}  {pct:5.1f}%  {cat}{mark}")
        print()
    maint_pct = 100.0 * cats.get("maintenance", 0) / total if total else 0
    safety_pct = 100.0 * cats.get("safety", 0) / total if total else 0
    coach_n = sum(cats.get(c, 0) for c in ("maintenance", "reliability", "fuel_economy"))
    coach_pct = 100.0 * coach_n / total if total else 0
    print(f"maintenance: {cats.get('maintenance', 0)} ({maint_pct:.1f}%)")
    print(f"safety:      {cats.get('safety', 0)} ({safety_pct:.1f}%)")
    print(
        f"coach mix (maintenance+reliability+fuel_economy): {coach_n} ({coach_pct:.1f}%)"
    )
    warns: list[str] = []
    if maint_pct < args.min_maintenance_pct:
        warns.append(
            f"maintenance share {maint_pct:.1f}% < target {args.min_maintenance_pct:.1f}% "
            "(NHTSA-heavy corpora skew safety — add coach schedule JSONL)"
        )
    if safety_pct < args.min_safety_pct:
        warns.append(
            f"safety share {safety_pct:.1f}% < target {args.min_safety_pct:.1f}%"
        )
    if coach_pct < args.min_coach_mix_pct:
        warns.append(
            f"coach-mix {coach_pct:.1f}% < target {args.min_coach_mix_pct:.1f}% "
            "(run expand-maint / add maintenance coach schedules)"
        )

    print()
    print("priority model coverage:")
    by_bm: dict[tuple[str, str], int] = defaultdict(int)
    for r in rows:
        by_bm[(str(r.get("brand") or ""), str(r.get("model") or ""))] += 1
    for brand, model in PRIORITY_MODELS:
        n = 0
        for (b, m), c in by_bm.items():
            if b.lower() == brand.lower() and model.lower() in m.lower():
                n += c
        flag = "OK" if n >= 20 else ("LOW" if n > 0 else "MISS")
        print(f"  [{flag:4}] {n:4d}  {brand} {model}")

    print()
    print("top brands:")
    for b, n in brands.most_common(12):
        print(f"  {n:5d}  {b}")

    if args.write_deduped and dup_ids:
        seen: set[str] = set()
        out: list[str] = []
        for r in rows:
            rid = r.get("id")
            if not rid or rid in seen:
                continue
            seen.add(rid)
            out.append(json.dumps(r, ensure_ascii=False))
        path.write_text("\n".join(out) + "\n", encoding="utf-8")
        print(f"\nRewrote deduped file → {len(out)} rows")
    elif dup_ids:
        print(f"\nTip: re-run with --write-deduped to drop {sum(n-1 for n in dup_ids.values())} duplicate id rows")

    if warns:
        print("\nWARNINGS:")
        for w in warns:
            print(f"  - {w}")
        return 2

    print("\nValidation OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
