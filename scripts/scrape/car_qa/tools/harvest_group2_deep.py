#!/usr/bin/env python3
"""
Group-2 deep harvester — next US volume tier after Group 1.

Models: Telluride, Ram 1500, Forester/Outback, Wrangler/Grand Cherokee,
        Tesla Model Y (EV-biased), Tucson/Santa Fe, CX-5.

Reuses Group-1 alias merge + component diversification.
Tesla gets extra EV component / keyword bias (battery, charging, software).

  ./run.sh group2
  ./run.sh group2 --only-model="Model Y" --sources=complaints
  ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=150

Appends to output/raw_posts.jsonl (pass --replace-raw only if you intend to wipe).
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from harvest_batch2 import (  # type: ignore
    EPA_MODEL_HINTS,
    harvest_epa,
    load_existing_raw_ids,
    write_item,
    years_from_range,
)
from harvest_batch3 import harvest_safety  # type: ignore
from harvest_group1_deep import (  # type: ignore
    diversify_complaints,
    fetch_complaints_with_aliases,
    harvest_recalls_deep,
    nhtsa_model_candidates,
)
from harvest_nhtsa import complaint_to_raw  # type: ignore

MODELS_G2 = ROOT / "config" / "models_group2.json"
MODELS_MAIN = ROOT / "config" / "models.json"
RAW_OUT = ROOT / "output" / "raw_posts.jsonl"

# Broader DIY + EV component bias (maintenance / brakes / battery / oil / tires / transmission)
PRIORITY_COMPONENT_KEYS_G2 = (
    "engine",
    "power train",
    "powertrain",
    "transmission",
    "electrical",
    "hybrid propulsion",
    "ev",
    "battery",
    "service brakes",
    "brake",
    "fuel",
    "tires",
    "suspension",
    "steering",
    "air bags",
    "forward collision",
    "lane departure",
    "electronic stability",
    "visibility",
    "structure",
    "vehicle speed control",
    "unknown or other",
)

EV_COMPONENT_KEYS = (
    "battery",
    "electrical",
    "ev",
    "hybrid propulsion",
    "power train",
    "powertrain",
    "vehicle speed control",
    "forward collision",
    "lane departure",
    "service brakes",
    "brake",
    "tires",
    "structure",
    "visibility",
    "unknown or other",
)

EPA_MODEL_HINTS.update(
    {
        "Telluride": ["Telluride"],
        "1500": ["1500"],
        "Forester": ["Forester"],
        "Outback": ["Outback"],
        "Wrangler": ["Wrangler"],
        "Grand Cherokee": ["Grand Cherokee"],
        "Model Y": ["Model Y", "ModelY"],
        "Tucson": ["Tucson"],
        "Santa Fe": ["Santa Fe"],
        "CX-5": ["CX-5", "CX5"],
    }
)


def load_models() -> list[dict]:
    return json.loads(MODELS_G2.read_text(encoding="utf-8"))


def merge_into_main(models: list[dict]) -> None:
    main = json.loads(MODELS_MAIN.read_text(encoding="utf-8"))
    keys = {(m["brand"], m["model"]) for m in main}
    added = 0
    for m in models:
        key = (m["brand"], m["model"])
        if key in keys:
            for row in main:
                if (row["brand"], row["model"]) == key:
                    row["year_range"] = m.get("year_range", row.get("year_range"))
                    row["group"] = 2
                    break
            continue
        main.append(
            {
                "brand": m["brand"],
                "model": m["model"],
                "year_range": m.get("year_range", "2018-2025"),
                "slug": m.get("slug"),
                "group": 2,
            }
        )
        keys.add(key)
        added += 1
    MODELS_MAIN.write_text(json.dumps(main, indent=2) + "\n", encoding="utf-8")
    if added:
        print(f"Merged {added} new models into config/models.json", flush=True)


def _boost_ev_rows(rows: list[dict], keywords: list[str]) -> list[dict]:
    """Soft-prioritize complaint summaries matching EV owner topics."""
    if not keywords:
        return rows
    kws = [k.lower() for k in keywords]

    def score(row: dict) -> tuple[int, int]:
        text = f"{row.get('components') or ''} {row.get('summary') or ''}".lower()
        hits = sum(1 for k in kws if k in text)
        return (hits, len(row.get("summary") or ""))

    return sorted(rows, key=score, reverse=True)


def diversify_for_model(m: dict, rows: list[dict], limit: int) -> list[dict]:
    """Component-diverse sample; Tesla also boosts EV keyword hits first."""
    # Temporarily swap priority list used by diversify_complaints
    import harvest_group1_deep as g1  # type: ignore

    prev = g1.PRIORITY_COMPONENT_KEYS
    try:
        if m.get("ev"):
            g1.PRIORITY_COMPONENT_KEYS = EV_COMPONENT_KEYS
            rows = _boost_ev_rows(rows, list(m.get("ev_keywords") or []))
        else:
            g1.PRIORITY_COMPONENT_KEYS = PRIORITY_COMPONENT_KEYS_G2
        return diversify_complaints(rows, limit)
    finally:
        g1.PRIORITY_COMPONENT_KEYS = prev


def harvest_complaints_group2(
    client: httpx.Client,
    fh,
    seen: set[str],
    models: list[dict],
    per_year: int,
    sleep: float,
) -> int:
    written = 0
    for m in models:
        brand, model = m["brand"], m["model"]
        years = m.get("year_range", "2018-2025")
        candidates = nhtsa_model_candidates(m)
        merge = bool(m.get("ev")) or len(candidates) > 2
        print(
            f"[complaints] {brand} {model} aliases={candidates} merge={merge} ev={bool(m.get('ev'))}",
            flush=True,
        )
        model_kept = 0
        for year in years_from_range(years):
            try:
                used_model, rows = fetch_complaints_with_aliases(
                    client, brand, candidates, year, merge_aliases=merge
                )
            except Exception as exc:
                print(f"  ! {year}: {exc}", flush=True)
                time.sleep(sleep)
                continue
            api_n = len(rows)
            selected = diversify_for_model(
                m, rows, per_year if per_year > 0 else len(rows)
            )
            kept = 0
            for row in selected:
                item = complaint_to_raw(row, brand, model, years)
                if not item:
                    continue
                meta = item.setdefault("metadata", {})
                meta["harvest"] = "group2_deep"
                meta["nhtsa_model"] = used_model
                if m.get("ev"):
                    meta["ev"] = True
                    meta["ev_keywords"] = m.get("ev_keywords") or []
                if write_item(fh, seen, item):
                    written += 1
                    kept += 1
                    model_kept += 1
            print(
                f"  {year}: api={api_n} selected={len(selected)} kept={kept} via={used_model}",
                flush=True,
            )
            time.sleep(sleep)
        print(f"  >> {brand} {model} complaint rows this run: {model_kept}", flush=True)
    return written


def main() -> int:
    load_dotenv(ROOT.parents[2] / ".env.local")
    ap = argparse.ArgumentParser(description="Deep harvest US Group-2 models")
    ap.add_argument("--sleep", type=float, default=0.28)
    ap.add_argument(
        "--per-year",
        type=int,
        default=80,
        help="Max diversified complaints kept per model-year (0 = all)",
    )
    ap.add_argument("--replace-raw", action="store_true")
    ap.add_argument(
        "--sources",
        default="complaints,recalls,safety,epa",
        help="complaints,recalls,safety,epa",
    )
    ap.add_argument("--limit-models", type=int, default=0)
    ap.add_argument(
        "--only-model",
        default="",
        help="Optional substring filter, e.g. Model Y or Telluride",
    )
    args = ap.parse_args()
    sources = {s.strip().lower() for s in args.sources.split(",") if s.strip()}

    models = load_models()
    if args.only_model.strip():
        needle = args.only_model.strip().lower()
        models = [
            m
            for m in models
            if needle in m["model"].lower() or needle in m["brand"].lower()
        ]
    if args.limit_models:
        models = models[: args.limit_models]
    print(f"Group2 models: {len(models)} | deep harvest", flush=True)
    if models:
        merge_into_main(models)

    seen = set() if args.replace_raw else load_existing_raw_ids(RAW_OUT)
    RAW_OUT.parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if args.replace_raw else "a"

    total = 0
    with httpx.Client(
        headers={
            "User-Agent": "GarageGeniusAI/0.1 (internal DIY RAG; NHTSA/EPA public APIs)"
        },
        follow_redirects=True,
        timeout=60.0,
    ) as client, RAW_OUT.open(mode, encoding="utf-8") as fh:
        if "complaints" in sources:
            print("\n=== Complaints (Group2 deep) ===", flush=True)
            total += harvest_complaints_group2(
                client, fh, seen, models, args.per_year, args.sleep
            )
        if "recalls" in sources:
            print("\n=== Recalls (Group2) ===", flush=True)
            total += harvest_recalls_deep(client, fh, seen, models, args.sleep)
        if "safety" in sources:
            print("\n=== Safety Ratings (Group2) ===", flush=True)
            total += harvest_safety(client, fh, seen, models, args.sleep)
        if "epa" in sources:
            print("\n=== EPA MPG (Group2) ===", flush=True)
            total += harvest_epa(client, fh, seen, models, args.sleep)

    lines = sum(1 for line in RAW_OUT.open(encoding="utf-8") if line.strip())
    print(f"\nDone. Wrote {total} new raw rows → {RAW_OUT} ({lines} lines total)", flush=True)
    print(
        "Next: ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=150",
        flush=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
