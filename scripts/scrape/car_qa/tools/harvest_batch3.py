#!/usr/bin/env python3
"""
Batch-3 harvester:
  1) NHTSA Safety Ratings (all models in models.json + models_batch3.json)
  2) Complaints + Recalls + EPA for NEW models only (models_batch3.json)

  ./run.sh batch3
  ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=150
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

# Reuse batch1/2 helpers
from harvest_batch2 import (  # type: ignore
    EPA_MODEL_HINTS,
    harvest_epa,
    harvest_recalls,
    load_existing_raw_ids,
    nhtsa_names,
    write_item,
    years_from_range,
)
from harvest_nhtsa import (  # type: ignore
    complaint_to_raw,
    fetch_complaints,
)

MODELS_MAIN = ROOT / "config" / "models.json"
MODELS_B3 = ROOT / "config" / "models_batch3.json"
RAW_OUT = ROOT / "output" / "raw_posts.jsonl"

SAFETY_LIST = "https://api.nhtsa.gov/SafetyRatings/modelyear/{year}/make/{make}/model/{model}"
SAFETY_DETAIL = "https://api.nhtsa.gov/SafetyRatings/VehicleId/{vehicle_id}"

# Extra EPA hints for batch3 models
EPA_MODEL_HINTS.update(
    {
        "Pilot": ["Pilot"],
        "Accord": ["Accord"],
        "Civic": ["Civic"],
        "Tacoma": ["Tacoma"],
        "Highlander": ["Highlander"],
        "Corolla": ["Corolla"],
        "Silverado": ["Silverado"],
        "Equinox": ["Equinox"],
        "Explorer": ["Explorer"],
        "Escape": ["Escape"],
        "Santa Fe": ["Santa Fe"],
        "Sportage": ["Sportage"],
        "Outback": ["Outback"],
        "CX-50": ["CX-50"],
        "Grand Cherokee": ["Grand Cherokee"],
        "Sierra": ["Sierra"],
        "Pathfinder": ["Pathfinder"],
        "Tiguan": ["Tiguan"],
        "X3": ["X3"],
        "NX": ["NX"],
    }
)


def raw_id(*parts: str) -> str:
    h = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"b3_{h}"


def load_models() -> tuple[list[dict], list[dict]]:
    main = json.loads(MODELS_MAIN.read_text(encoding="utf-8"))
    new = json.loads(MODELS_B3.read_text(encoding="utf-8"))
    return main, new


def safety_to_raw(detail: dict, brand: str, model: str, years: str) -> dict | None:
    desc = (detail.get("VehicleDescription") or "").strip()
    overall = detail.get("OverallRating")
    if not desc:
        return None
    # Skip empty "Not Rated" only vehicles with no useful ADAS flags? Still keep if any rating exists
    front = detail.get("OverallFrontCrashRating")
    side = detail.get("OverallSideCrashRating")
    roll = detail.get("RolloverRating")
    body = (
        f"NHTSA safety ratings for {desc}.\n"
        f"Overall: {overall}. Front crash: {front}. Side crash: {side}. Rollover: {roll}.\n"
        f"Electronic Stability Control: {detail.get('NHTSAElectronicStabilityControl')}.\n"
        f"Forward Collision Warning: {detail.get('ForwardCollisionWarning')}.\n"
        f"Lane Departure Warning: {detail.get('LaneDepartureWarning')}.\n"
        f"Crash Avoidance: {detail.get('NHTSAForwardCollisionWarning') or detail.get('CrashAvoidance')}.\n"
        f"Ratings are official NHTSA star ratings (or 'Not Rated' when unavailable). "
        f"Always verify the exact trim on NHTSA.gov."
    )
    vid = str(detail.get("VehicleId") or detail.get("VehicleId") or "")
    return {
        "source": "NHTSA Safety Ratings",
        "source_url": f"https://www.nhtsa.gov/vehicle/{vid}" if vid else "https://www.nhtsa.gov/ratings",
        "brand": brand,
        "model": model,
        "year_range": years,
        "title": f"NHTSA rating: {desc} (Overall {overall})",
        "body": body[:4000],
        "comments": [],
        "score": 9,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "raw_id": raw_id("safety", brand, model, vid, str(overall)),
        "metadata": {
            "kind": "safety_rating",
            "vehicle_id": vid,
            "overall": overall,
            "front": front,
            "side": side,
            "rollover": roll,
        },
    }


def harvest_safety(
    client: httpx.Client,
    fh,
    seen: set[str],
    models: list[dict],
    sleep: float,
) -> int:
    written = 0
    for m in models:
        brand, model = m["brand"], m["model"]
        years = m.get("year_range", "2023-2025")
        make_q, model_q = nhtsa_names(brand, model)
        # Safety API prefers title-ish model without HYBRID suffix usually
        print(f"[safety] {brand} {model} ({make_q}/{model_q})")
        for year in years_from_range(years):
            url = SAFETY_LIST.format(
                year=year,
                make=make_q.title() if make_q != "BMW" else make_q,
                model=model_q,
            )
            # Honda CR-V style: make Honda, model CR-V
            if make_q == "MERCEDES-BENZ":
                url = SAFETY_LIST.format(year=year, make="Mercedes-Benz", model=model_q)
            try:
                r = client.get(url, timeout=45.0)
                if r.status_code == 404:
                    print(f"  {year}: no variants")
                    time.sleep(sleep)
                    continue
                r.raise_for_status()
                data = r.json()
                variants = list(data.get("Results") or [])
            except Exception as exc:
                print(f"  ! list {year}: {exc}")
                time.sleep(sleep)
                continue

            kept = 0
            for v in variants[:4]:
                vid = v.get("VehicleId")
                if not vid:
                    continue
                try:
                    rd = client.get(SAFETY_DETAIL.format(vehicle_id=vid), timeout=45.0)
                    rd.raise_for_status()
                    detail = (rd.json().get("Results") or [{}])[0]
                    # ensure VehicleId present
                    detail.setdefault("VehicleId", vid)
                    detail.setdefault(
                        "VehicleDescription", v.get("VehicleDescription") or ""
                    )
                except Exception as exc:
                    print(f"  ! detail {vid}: {exc}")
                    continue
                item = safety_to_raw(detail, brand, model, years)
                if item and write_item(fh, seen, item):
                    written += 1
                    kept += 1
                time.sleep(sleep)
            print(f"  {year}: variants={len(variants)} kept={kept}")
            time.sleep(sleep)
    return written


def harvest_complaints_for(
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
        years = m.get("year_range", "2023-2025")
        make_q, model_q = nhtsa_names(brand, model)
        print(f"[complaints] {brand} {model}")
        for year in years_from_range(years):
            try:
                rows = fetch_complaints(client, make_q, model_q, year)
            except Exception as exc:
                print(f"  ! {year}: {exc}")
                time.sleep(sleep)
                continue
            rows = sorted(rows, key=lambda r: len((r.get("summary") or "")), reverse=True)[
                :per_year
            ]
            kept = 0
            for row in rows:
                item = complaint_to_raw(row, brand, model, years)
                if not item:
                    continue
                # namespace raw_id to b3 to avoid colliding with batch1 hash prefix only —
                # complaint_to_raw already uses nhtsa_ hash; keep as-is for dedupe
                if write_item(fh, seen, item):
                    written += 1
                    kept += 1
            print(f"  {year}: kept={kept}")
            time.sleep(sleep)
    return written


def merge_models_into_main(new_models: list[dict]) -> None:
    """Append batch3 models into models.json if id (brand+model) missing."""
    main = json.loads(MODELS_MAIN.read_text(encoding="utf-8"))
    keys = {(m["brand"], m["model"]) for m in main}
    added = 0
    for m in new_models:
        key = (m["brand"], m["model"])
        if key in keys:
            continue
        main.append(
            {
                "brand": m["brand"],
                "model": m["model"],
                "year_range": m.get("year_range", "2023-2025"),
                "slug": m.get("slug"),
                "subreddit": m.get("subreddit"),
            }
        )
        keys.add(key)
        added += 1
    if added:
        MODELS_MAIN.write_text(json.dumps(main, indent=2) + "\n", encoding="utf-8")
        print(f"Merged {added} models into config/models.json")


def main() -> int:
    load_dotenv(ROOT.parents[2] / ".env.local")
    ap = argparse.ArgumentParser()
    ap.add_argument("--sleep", type=float, default=0.22)
    ap.add_argument("--per-year", type=int, default=10)
    ap.add_argument("--replace-raw", action="store_true")
    ap.add_argument(
        "--sources",
        default="safety,complaints,recalls,epa",
        help="safety,complaints,recalls,epa",
    )
    args = ap.parse_args()
    sources = {s.strip().lower() for s in args.sources.split(",") if s.strip()}

    main_models, new_models = load_models()
    all_models = main_models + [
        m
        for m in new_models
        if (m["brand"], m["model"]) not in {(x["brand"], x["model"]) for x in main_models}
    ]
    merge_models_into_main(new_models)

    seen = set() if args.replace_raw else load_existing_raw_ids(RAW_OUT)
    RAW_OUT.parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if args.replace_raw else "a"

    total = 0
    with httpx.Client(
        headers={
            "User-Agent": "GarageGeniusAI/0.1 (internal DIY RAG; NHTSA/EPA public APIs)"
        },
        follow_redirects=True,
        timeout=45.0,
    ) as client, RAW_OUT.open(mode, encoding="utf-8") as fh:
        if "safety" in sources:
            total += harvest_safety(client, fh, seen, all_models, args.sleep)
        # Full corpus only for NEW models (avoid re-pulling batch1/2)
        if "complaints" in sources:
            total += harvest_complaints_for(
                client, fh, seen, new_models, args.per_year, args.sleep
            )
        if "recalls" in sources:
            total += harvest_recalls(client, fh, seen, new_models, args.sleep)
        if "epa" in sources:
            total += harvest_epa(client, fh, seen, new_models, args.sleep)

    print(f"\nDone. Wrote {total} new raw rows → {RAW_OUT}")
    print("Next: ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=150")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
