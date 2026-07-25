#!/usr/bin/env python3
"""
Group-1 deep harvester — US market volume leaders.

Expands year range (default 2018–2025), raises complaint caps, and diversifies
by NHTSA component so DIY topics (oil / brakes / battery / …) are covered.

Reddit / Edmunds HTML remain blocked; this uses public NHTSA + EPA APIs only.

  ./run.sh group1
  ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=150

Target: ~300–800 raw rows per model → LLM clean to high-quality Q&A.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from harvest_batch2 import (  # type: ignore
    EPA_MODEL_HINTS,
    RECALLS_API,
    harvest_epa,
    load_existing_raw_ids,
    nhtsa_names,
    recall_to_raw,
    write_item,
    years_from_range,
)
from harvest_batch3 import harvest_safety  # type: ignore
from harvest_nhtsa import complaint_to_raw, fetch_complaints  # type: ignore

MODELS_G1 = ROOT / "config" / "models_group1.json"
MODELS_MAIN = ROOT / "config" / "models.json"
RAW_OUT = ROOT / "output" / "raw_posts.jsonl"

# Prefer DIY-relevant components when diversifying (maps to keyword strategy)
PRIORITY_COMPONENT_KEYS = (
    "engine",
    "power train",
    "powertrain",
    "electrical",
    "service brakes",
    "brake",
    "fuel",
    "unknown or other",
    "air bags",
    "steering",
    "suspension",
    "tires",
    "visibility",
    "structure",
    "vehicle speed control",
    "electronic stability",
    "lane departure",
    "forward collision",
    "hybrid propulsion",
    "ev",
    "battery",
)

EPA_MODEL_HINTS.update(
    {
        "RAV4": ["RAV4"],
        "Camry": ["Camry"],
        "Corolla": ["Corolla"],
        "Tacoma": ["Tacoma"],
        "F-150": ["F-150", "F150"],
        "Explorer": ["Explorer"],
        "Escape": ["Escape"],
        "CR-V": ["CR-V"],
        "Civic": ["Civic"],
        "Accord": ["Accord"],
        "Pilot": ["Pilot"],
        "Silverado": ["Silverado"],
        "Equinox": ["Equinox"],
        "Tahoe": ["Tahoe"],
    }
)


def load_models() -> list[dict]:
    return json.loads(MODELS_G1.read_text(encoding="utf-8"))


def merge_into_main(models: list[dict]) -> None:
    main = json.loads(MODELS_MAIN.read_text(encoding="utf-8"))
    keys = {(m["brand"], m["model"]) for m in main}
    added = 0
    for m in models:
        key = (m["brand"], m["model"])
        if key in keys:
            # widen year_range on existing row if group1 is broader
            for row in main:
                if (row["brand"], row["model"]) == key:
                    row["year_range"] = m.get("year_range", row.get("year_range"))
                    break
            continue
        main.append(
            {
                "brand": m["brand"],
                "model": m["model"],
                "year_range": m.get("year_range", "2018-2025"),
                "slug": m.get("slug"),
                "group": 1,
            }
        )
        keys.add(key)
        added += 1
    MODELS_MAIN.write_text(json.dumps(main, indent=2) + "\n", encoding="utf-8")
    if added:
        print(f"Merged {added} new models into config/models.json", flush=True)


def nhtsa_model_candidates(m: dict) -> list[str]:
    """Ordered list of NHTSA model strings to try for this garage model."""
    out: list[str] = []
    for x in m.get("nhtsa_models") or []:
        if x and x not in out:
            out.append(x)
    _, default = nhtsa_names(m["brand"], m["model"])
    if default and default not in out:
        out.append(default)
    if m["model"] not in out:
        out.append(m["model"])
    return out


def fetch_complaints_with_aliases(
    client: httpx.Client,
    brand: str,
    candidates: list[str],
    year: int,
    *,
    merge_aliases: bool = False,
) -> tuple[str, list[dict]]:
    """
    Try NHTSA model aliases. If merge_aliases=True (e.g. F-150 cab styles),
    union all successful alias results and dedupe by ODI number.
    """
    make = brand.upper()
    last_err: Exception | None = None
    merged: list[dict] = []
    seen_odi: set[str] = set()
    used_models: list[str] = []

    for model_q in candidates:
        try:
            rows = fetch_complaints(client, make, model_q, year)
        except Exception as exc:
            last_err = exc
            continue
        if not rows and not merge_aliases:
            # Wrong alias can return 200 + empty — keep trying.
            continue
        used_models.append(model_q)
        if not merge_aliases:
            return model_q, rows
        for row in rows:
            odi = str(row.get("odiNumber") or row.get("complaintId") or "")
            key = odi or json.dumps(row.get("summary") or "")[:80]
            if key in seen_odi:
                continue
            seen_odi.add(key)
            merged.append(row)

    if merged:
        return "+".join(used_models[:3]), merged
    if used_models:
        return used_models[0], []
    if last_err:
        raise last_err
    return candidates[0], []


def diversify_complaints(rows: list[dict], limit: int) -> list[dict]:
    """
    Keep up to `limit` complaints, spreading across components so we don't
    only keep the longest engine-fire narratives.
    """
    if limit <= 0 or len(rows) <= limit:
        return list(rows)

    usable = [r for r in rows if len((r.get("summary") or "").strip()) >= 40]
    if len(usable) <= limit:
        return usable

    buckets: dict[str, list[dict]] = defaultdict(list)
    for r in usable:
        comp = (r.get("components") or "UNKNOWN").strip().upper() or "UNKNOWN"
        # normalize first component token
        key = comp.split(",")[0].strip() or "UNKNOWN"
        buckets[key].append(r)

    for key in buckets:
        buckets[key].sort(key=lambda r: len(r.get("summary") or ""), reverse=True)

    # Order buckets: priority keywords first, then by size
    def bucket_rank(name: str) -> tuple[int, int]:
        low = name.lower()
        for i, kw in enumerate(PRIORITY_COMPONENT_KEYS):
            if kw in low:
                return (0, i)
        return (1, -len(buckets[name]))

    ordered_keys = sorted(buckets.keys(), key=bucket_rank)

    # Round-robin from buckets
    picked: list[dict] = []
    seen_odi: set[str] = set()
    idx = {k: 0 for k in ordered_keys}
    while len(picked) < limit:
        progressed = False
        for k in ordered_keys:
            i = idx[k]
            while i < len(buckets[k]):
                row = buckets[k][i]
                i += 1
                odi = str(row.get("odiNumber") or row.get("complaintId") or id(row))
                if odi in seen_odi:
                    continue
                seen_odi.add(odi)
                picked.append(row)
                progressed = True
                break
            idx[k] = i
            if len(picked) >= limit:
                break
        if not progressed:
            break
    return picked


def harvest_recalls_deep(
    client: httpx.Client,
    fh,
    seen: set[str],
    models: list[dict],
    sleep: float,
) -> int:
    written = 0
    for m in models:
        brand, model = m["brand"], m["model"]
        years = m.get("year_range", "2018-2025")
        candidates = nhtsa_model_candidates(m)
        print(f"[recalls] {brand} {model} aliases={candidates}", flush=True)
        for year in years_from_range(years):
            rows: list[dict] = []
            used = candidates[0]
            for model_q in candidates:
                try:
                    r = client.get(
                        RECALLS_API,
                        params={
                            "make": brand.upper(),
                            "model": model_q,
                            "modelYear": year,
                        },
                        timeout=45.0,
                    )
                    r.raise_for_status()
                    rows = list(r.json().get("results") or [])
                    used = model_q
                    break
                except Exception:
                    continue
            else:
                print(f"  ! {year}: no alias worked", flush=True)
                time.sleep(sleep)
                continue
            kept = 0
            for row in rows:
                item = recall_to_raw(row, brand, model, years)
                if item and write_item(fh, seen, item):
                    written += 1
                    kept += 1
            print(f"  {year}: recalls={len(rows)} kept={kept} via={used}", flush=True)
            time.sleep(sleep)
    return written


def harvest_complaints_deep(
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
        merge = len(candidates) > 2  # e.g. F-150 cab variants
        print(
            f"[complaints] {brand} {model} aliases={candidates} merge={merge}",
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
            selected = diversify_complaints(rows, per_year if per_year > 0 else len(rows))
            kept = 0
            for row in selected:
                item = complaint_to_raw(row, brand, model, years)
                if not item:
                    continue
                item.setdefault("metadata", {})["harvest"] = "group1_deep"
                item["metadata"]["nhtsa_model"] = used_model
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
    ap = argparse.ArgumentParser(description="Deep harvest US Group-1 models")
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
    ap.add_argument(
        "--limit-models",
        type=int,
        default=0,
        help="Optional cap for smoke tests",
    )
    ap.add_argument(
        "--only-model",
        default="",
        help="Optional substring filter, e.g. F-150 or Silverado",
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
    print(f"Group1 models: {len(models)} | years deep harvest", flush=True)
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
            print("\n=== Complaints (Group1 deep) ===", flush=True)
            total += harvest_complaints_deep(
                client, fh, seen, models, args.per_year, args.sleep
            )
        if "recalls" in sources:
            print("\n=== Recalls (Group1) ===", flush=True)
            total += harvest_recalls_deep(client, fh, seen, models, args.sleep)
        if "safety" in sources:
            print("\n=== Safety Ratings (Group1) ===", flush=True)
            total += harvest_safety(client, fh, seen, models, args.sleep)
        if "epa" in sources:
            print("\n=== EPA MPG (Group1) ===", flush=True)
            total += harvest_epa(client, fh, seen, models, args.sleep)

    lines = sum(1 for line in RAW_OUT.open(encoding="utf-8") if line.strip())
    print(f"\nDone. Wrote {total} new raw rows → {RAW_OUT} ({lines} lines total)", flush=True)
    print("Next: ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=150", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
