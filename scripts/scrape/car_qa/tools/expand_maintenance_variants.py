#!/usr/bin/env python3
"""
Expand maintenance-coach-schedules.jsonl into nearby-mileage question variants,
then append unique rows into owner-reviews.jsonl.

  python tools/expand_maintenance_variants.py
  python tools/expand_maintenance_variants.py --dry-run
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]  # repo scripts/
SCHED = ROOT / "data" / "maintenance-coach-schedules.jsonl"
VARIANTS_OUT = ROOT / "data" / "maintenance-coach-variants.jsonl"
QA_OUT = ROOT / "data" / "owner-reviews.jsonl"

# Anchor miles inferred from id/keywords → nearby owner phrasings
MILEAGE_VARIANTS: dict[int, list[int]] = {
    30_000: [28_000, 32_000, 35_000],
    50_000: [45_000, 48_000, 55_000],
    60_000: [55_000, 58_000, 65_000],
    80_000: [75_000, 78_000, 82_000],
    100_000: [95_000, 100_000, 105_000],
}

QUESTION_TEMPLATES = [
    "I'm at about {miles_fmt} miles on my {model} — what should I focus on checking?",
    "My {model} just hit roughly {miles_fmt} miles. Build me a short preventive plan.",
    "I have about {miles_fmt} miles now on this {brand} {model}. What matters most for prevention?",
    "At {miles_fmt} miles, what should I prioritize before a long trip in my {model}?",
]


def infer_anchor_miles(row: dict) -> int | None:
    blob = " ".join(
        [
            str(row.get("id") or ""),
            " ".join(row.get("keywords") or []),
            str(row.get("question") or ""),
        ]
    ).lower()
    for anchor in (100_000, 80_000, 60_000, 50_000, 30_000):
        short = f"{anchor // 1000}k"
        if short in blob or str(anchor) in blob or f"{anchor // 1000},000" in blob:
            return anchor
    # EV general card without mileage → treat as 50k coaching band
    if row.get("brand") == "Tesla" and "ev_coach" in str(row.get("id") or ""):
        return 50_000
    return None


def variant_id(base_id: str, miles: int, idx: int) -> str:
    h = hashlib.sha1(f"{base_id}|{miles}|{idx}".encode()).hexdigest()[:8]
    return f"{base_id}_v{miles // 1000}k_{h}"


def make_variants(row: dict) -> list[dict]:
    anchor = infer_anchor_miles(row)
    if not anchor:
        return []
    brand, model = row["brand"], row["model"]
    out: list[dict] = []
    for miles in MILEAGE_VARIANTS.get(anchor, [anchor]):
        miles_fmt = f"{miles:,}"
        for i, tmpl in enumerate(QUESTION_TEMPLATES):
            q = tmpl.format(
                miles_fmt=miles_fmt, brand=brand, model=model
            )
            # Lightly adapt answer opener to the variant mileage
            answer = row["answer"]
            opener = f"At about {miles_fmt} miles, "
            if not answer.lower().startswith("at "):
                answer = opener + answer[0].lower() + answer[1:]
            else:
                answer = re.sub(
                    r"^(At|Around|Near)\s+~?[\d,]+(?:k)?\s*miles[,:]?\s*",
                    opener,
                    answer,
                    count=1,
                    flags=re.I,
                )
            vid = variant_id(row["id"], miles, i)
            out.append(
                {
                    **row,
                    "id": vid,
                    "question": q,
                    "answer": answer,
                    "keywords": list(
                        dict.fromkeys(
                            list(row.get("keywords") or [])
                            + [f"{miles // 1000}k", "variant", "preventive", "mileage"]
                        )
                    ),
                    "source": "coach_maintenance_schedule_variant",
                }
            )
    return out


def load_ids(path: Path) -> set[str]:
    if not path.is_file():
        return set()
    ids: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rid = json.loads(line).get("id")
            if rid:
                ids.add(rid)
        except json.JSONDecodeError:
            continue
    return ids


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--append-qa", action="store_true", default=True)
    args = ap.parse_args()

    base = [
        json.loads(line)
        for line in SCHED.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    variants: list[dict] = []
    for row in base:
        variants.extend(make_variants(row))

    print(f"base schedules: {len(base)} → variants: {len(variants)}")
    if args.dry_run:
        for v in variants[:5]:
            print(f"  - {v['id']}: {v['question'][:90]}")
        return 0

    VARIANTS_OUT.write_text(
        "\n".join(json.dumps(v, ensure_ascii=False) for v in variants) + "\n",
        encoding="utf-8",
    )
    print(f"wrote {VARIANTS_OUT}")

    if args.append_qa:
        seen = load_ids(QA_OUT)
        added = 0
        with QA_OUT.open("a", encoding="utf-8") as fh:
            for v in variants:
                if v["id"] in seen:
                    continue
                fh.write(json.dumps(v, ensure_ascii=False) + "\n")
                seen.add(v["id"])
                added += 1
        print(f"appended {added} variants → {QA_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
