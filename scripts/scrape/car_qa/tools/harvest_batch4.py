#!/usr/bin/env python3
"""
Batch-4 harvester: safety + complaints + recalls + EPA for models_batch4.json only.

  ./run.sh batch4
  ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=150
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from harvest_batch2 import (  # type: ignore
    EPA_MODEL_HINTS,
    harvest_epa,
    harvest_recalls,
    load_existing_raw_ids,
)
from harvest_batch3 import (  # type: ignore
    harvest_complaints_for,
    harvest_safety,
    merge_models_into_main,
)

MODELS_MAIN = ROOT / "config" / "models.json"
MODELS_B4 = ROOT / "config" / "models_batch4.json"
RAW_OUT = ROOT / "output" / "raw_posts.jsonl"

EPA_MODEL_HINTS.update(
    {
        "MDX": ["MDX"],
        "RDX": ["RDX"],
        "Q5": ["Q5"],
        "Q7": ["Q7"],
        "Enclave": ["Enclave"],
        "Escalade": ["Escalade"],
        "XT5": ["XT5"],
        "Pacifica": ["Pacifica"],
        "Durango": ["Durango"],
        "QX60": ["QX60"],
        "Navigator": ["Navigator"],
        "Aviator": ["Aviator"],
        "Outlander": ["Outlander"],
        "Countryman": ["Countryman"],
        "XC60": ["XC60"],
        "3 Series": ["3 Series", "330i", "330"],
        "C-Class": ["C-Class", "C 300", "C300"],
        "GLC": ["GLC"],
        "Palisade": ["Palisade"],
        "Sorento": ["Sorento"],
    }
)


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

    new_models = json.loads(MODELS_B4.read_text(encoding="utf-8"))
    print(f"batch4 models: {len(new_models)}", flush=True)
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
            print("\n=== Safety Ratings (batch4) ===", flush=True)
            total += harvest_safety(client, fh, seen, new_models, args.sleep)
        if "complaints" in sources:
            print("\n=== Complaints (batch4) ===", flush=True)
            total += harvest_complaints_for(
                client, fh, seen, new_models, args.per_year, args.sleep
            )
        if "recalls" in sources:
            print("\n=== Recalls (batch4) ===", flush=True)
            total += harvest_recalls(client, fh, seen, new_models, args.sleep)
        if "epa" in sources:
            print("\n=== EPA MPG (batch4) ===", flush=True)
            total += harvest_epa(client, fh, seen, new_models, args.sleep)

    lines = sum(1 for line in RAW_OUT.open(encoding="utf-8") if line.strip())
    print(f"\nDone. Wrote {total} new raw rows → {RAW_OUT} ({lines} lines total)")
    print("Next: ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=150")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
