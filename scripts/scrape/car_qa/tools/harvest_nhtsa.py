#!/usr/bin/env python3
"""
Harvest owner-complaint style text from NHTSA public API (compliant, no robots block).

  python tools/harvest_nhtsa.py
  python tools/harvest_nhtsa.py --limit-models=10 --per-year=12

Writes/appends → output/raw_posts.jsonl
Then: ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=80
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

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

MODELS = ROOT / "config" / "models.json"
RAW_OUT = ROOT / "output" / "raw_posts.jsonl"
API = "https://api.nhtsa.gov/complaints/complaintsByVehicle"

# NHTSA often indexes base model names (not "Hybrid" trims)
NHTSA_MODEL_OVERRIDE = {
    "RAV4 Hybrid": "RAV4",
    "F-150": "F-150",
    "CR-V": "CR-V",
    "CX-5": "CX-5",
    "3 Series": "3-SERIES",
    "C-Class": "C-CLASS",
    "Model Y": "MODEL Y 5-SEAT",
    "1500": "1500",
    "2500": "2500",
    "Silverado": "SILVERADO 1500",
    "Grand Cherokee": "GRAND CHEROKEE",
    "GLE": "GLE CLASS",
    "X5": "X5",
    "RX": "RX 350",
    "XC90": "XC90 T6",
    "Cayenne": "CAYENNE",
}



def raw_id(*parts: str) -> str:
    h = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"nhtsa_{h}"


def load_existing_raw_ids(path: Path) -> set[str]:
    seen: set[str] = set()
    if not path.is_file():
        return seen
    for line in path.read_text(encoding="utf-8").splitlines():
        try:
            rid = json.loads(line).get("raw_id")
            if rid:
                seen.add(rid)
        except json.JSONDecodeError:
            continue
    return seen


def years_from_range(year_range: str) -> list[int]:
    m = re.match(r"(\d{4})\s*-\s*(\d{4})", year_range or "")
    if not m:
        return [2023, 2024, 2025]
    a, b = int(m.group(1)), int(m.group(2))
    return list(range(a, b + 1))


def nhtsa_names(brand: str, model: str) -> tuple[str, str]:
    make = brand.upper().replace("MERCEDES-BENZ", "MERCEDES-BENZ")
    if brand.lower() == "mercedes-benz":
        make = "MERCEDES-BENZ"
    model_q = NHTSA_MODEL_OVERRIDE.get(model, model)
    # Strip Hybrid / PHEV suffix for lookup if override missing
    if model_q == model and " Hybrid" in model:
        model_q = model.replace(" Hybrid", "").replace(" PHEV", "")
    if brand.upper() == "TESLA":
        # NHTSA expects e.g. "Model Y" not "MODEL Y"
        return "TESLA", model_q.title().replace("Model Y", "Model Y")
    return make, model_q


def fetch_complaints(client: httpx.Client, make: str, model: str, year: int) -> list[dict]:
    r = client.get(
        API,
        params={"make": make, "model": model, "modelYear": year},
        timeout=45.0,
    )
    r.raise_for_status()
    data = r.json()
    return list(data.get("results") or [])


def complaint_to_raw(row: dict, brand: str, model: str, years: str) -> dict | None:
    summary = (row.get("summary") or "").strip()
    components = (row.get("components") or "").strip()
    if len(summary) < 40:
        return None
    odi = str(row.get("odiNumber") or row.get("complaintId") or "")
    title = components or "Owner complaint"
    if len(title) > 120:
        title = title[:117] + "..."
    return {
        "source": "NHTSA",
        "source_url": f"https://www.nhtsa.gov/ (ODI {odi})" if odi else "https://www.nhtsa.gov/",
        "brand": brand,
        "model": model,
        "year_range": years,
        "title": f"{title} (NHTSA complaint)",
        "body": summary[:4000],
        "comments": [],
        "score": int(row.get("numberOfInjuries") or 0)
        + int(row.get("numberOfDeaths") or 0) * 5
        + (2 if row.get("crash") else 0),
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "raw_id": raw_id("nhtsa", brand, model, odi, summary[:120]),
        "metadata": {
            "odi": odi,
            "components": components,
            "model_year": row.get("productYear") or row.get("modelYear"),
            "fire": row.get("fire"),
            "crash": row.get("crash"),
        },
    }


def main() -> int:
    load_dotenv(ROOT.parents[2] / ".env.local")
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit-models", type=int, default=0, help="0 = all models")
    ap.add_argument("--per-year", type=int, default=15, help="Max complaints kept per model-year")
    ap.add_argument("--sleep", type=float, default=0.35)
    ap.add_argument("--replace-raw", action="store_true", help="Overwrite raw_posts.jsonl")
    args = ap.parse_args()

    models = json.loads(MODELS.read_text(encoding="utf-8"))
    if args.limit_models:
        models = models[: args.limit_models]

    seen = set() if args.replace_raw else load_existing_raw_ids(RAW_OUT)
    RAW_OUT.parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if args.replace_raw else "a"

    written = 0
    fetched = 0
    with httpx.Client(
        headers={"User-Agent": "GarageGeniusAI/0.1 (internal DIY RAG; NHTSA public API)"},
        follow_redirects=True,
    ) as client, RAW_OUT.open(mode, encoding="utf-8") as fh:
        for m in models:
            brand = m["brand"]
            model = m["model"]
            years = m.get("year_range", "2023-2025")
            make_q, model_q = nhtsa_names(brand, model)
            print(f"→ {brand} {model}  (NHTSA {make_q} / {model_q})")
            for year in years_from_range(years):
                try:
                    rows = fetch_complaints(client, make_q, model_q, year)
                except Exception as exc:
                    print(f"  ! {year}: {exc}")
                    time.sleep(args.sleep)
                    continue
                fetched += len(rows)
                # Prefer longer, component-tagged complaints
                rows = sorted(
                    rows,
                    key=lambda r: len((r.get("summary") or "")),
                    reverse=True,
                )[: args.per_year]
                kept = 0
                for row in rows:
                    item = complaint_to_raw(row, brand, model, years)
                    if not item:
                        continue
                    rid = item["raw_id"]
                    if rid in seen:
                        continue
                    seen.add(rid)
                    fh.write(json.dumps(item, ensure_ascii=False) + "\n")
                    written += 1
                    kept += 1
                print(f"  {year}: api={len(rows)} kept={kept}")
                time.sleep(args.sleep)

    print(f"\nDone. Fetched≈{fetched} complaints, wrote {written} new raw rows → {RAW_OUT}")
    print("Next: ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=80")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
