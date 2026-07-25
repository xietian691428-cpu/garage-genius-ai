#!/usr/bin/env python3
"""
Batch-2 harvester: NHTSA Recalls + EPA FuelEconomy.gov (compliant public APIs).

Replaces complaint-style raw corpus with recall + official MPG snippets.

  python tools/harvest_batch2.py --replace-raw
  ./run.sh batch2
  ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=120
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
from urllib.parse import quote

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

MODELS = ROOT / "config" / "models.json"
RAW_OUT = ROOT / "output" / "raw_posts.jsonl"

RECALLS_API = "https://api.nhtsa.gov/recalls/recallsByVehicle"
EPA_MODEL = "https://www.fueleconomy.gov/ws/rest/vehicle/menu/model"
EPA_OPTIONS = "https://www.fueleconomy.gov/ws/rest/vehicle/menu/options"
EPA_VEHICLE = "https://www.fueleconomy.gov/ws/rest/vehicle"

NHTSA_MODEL_OVERRIDE = {
    "RAV4 Hybrid": "RAV4",
    "F-150": "F-150",
    "CR-V": "CR-V",
    "CX-5": "CX-5",
    "Model Y": "Model Y",
    "1500": "1500",
    "Silverado": "SILVERADO 1500",
    "3 Series": "3-SERIES",
    "C-Class": "C-CLASS",
}


# EPA menu model name hints (matched by substring against EPA menu)
EPA_MODEL_HINTS = {
    "RAV4 Hybrid": ["RAV4 Hybrid"],
    "Camry": ["Camry"],
    "F-150": ["F150", "F-150"],
    "CR-V": ["CR-V"],
    "Colorado": ["Colorado"],
    "Forester": ["Forester"],
    "Wrangler": ["Wrangler"],
    "1500": ["1500"],
    "CX-5": ["CX-5"],
    "X5": ["X5"],
    "RX": ["RX"],
    "Atlas": ["Atlas"],
    "GLE": ["GLE"],
    "Telluride": ["Telluride"],
    "Rogue": ["Rogue"],
    "Tucson": ["Tucson"],
    "Model Y": ["Model Y"],
    "Macan": ["Macan"],
    "GV80": ["GV80"],
    "XC90": ["XC90"],
}


def raw_id(*parts: str) -> str:
    h = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"b2_{h}"


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
    return list(range(int(m.group(1)), int(m.group(2)) + 1))


def nhtsa_names(brand: str, model: str) -> tuple[str, str]:
    make = brand.upper()
    model_q = NHTSA_MODEL_OVERRIDE.get(model, model)
    if model_q == model and " Hybrid" in model:
        model_q = model.replace(" Hybrid", "")
    if make == "TESLA":
        return "TESLA", model_q
    return make, model_q


def write_item(fh, seen: set[str], item: dict) -> bool:
    rid = item.get("raw_id")
    if not rid or rid in seen:
        return False
    seen.add(rid)
    fh.write(json.dumps(item, ensure_ascii=False) + "\n")
    return True


def recall_to_raw(row: dict, brand: str, model: str, years: str) -> dict | None:
    summary = (row.get("Summary") or row.get("summary") or "").strip()
    consequence = (row.get("Conequence") or row.get("Consequence") or "").strip()
    remedy = (row.get("Remedy") or row.get("remedy") or "").strip()
    component = (row.get("Component") or row.get("component") or "Recall").strip()
    campaign = str(row.get("NHTSACampaignNumber") or row.get("nhtsaCampaignNumber") or "")
    body = "\n\n".join(
        x
        for x in (
            f"Component: {component}",
            f"Summary: {summary}" if summary else "",
            f"Consequence: {consequence}" if consequence else "",
            f"Remedy: {remedy}" if remedy else "",
        )
        if x
    )
    if len(body) < 60:
        return None
    return {
        "source": "NHTSA Recalls",
        "source_url": f"https://www.nhtsa.gov/recalls?nhtsaId={campaign}"
        if campaign
        else "https://www.nhtsa.gov/recalls",
        "brand": brand,
        "model": model,
        "year_range": years,
        "title": f"Recall: {component[:100]}",
        "body": body[:4000],
        "comments": [],
        "score": 10,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "raw_id": raw_id("recall", brand, model, campaign, summary[:80]),
        "metadata": {
            "campaign": campaign,
            "component": component,
            "model_year": row.get("ModelYear") or row.get("modelYear"),
            "kind": "recall",
        },
    }


def harvest_recalls(
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
        print(f"[recalls] {brand} {model} ({make_q}/{model_q})")
        for year in years_from_range(years):
            try:
                r = client.get(
                    RECALLS_API,
                    params={"make": make_q, "model": model_q, "modelYear": year},
                    timeout=45.0,
                )
                r.raise_for_status()
                data = r.json()
                rows = list(data.get("results") or [])
            except Exception as exc:
                print(f"  ! {year}: {exc}")
                time.sleep(sleep)
                continue
            kept = 0
            for row in rows:
                item = recall_to_raw(row, brand, model, years)
                if item and write_item(fh, seen, item):
                    written += 1
                    kept += 1
            print(f"  {year}: recalls={len(rows)} kept={kept}")
            time.sleep(sleep)
    return written


def _menu_items(payload: Any) -> list[dict]:
    if not isinstance(payload, dict):
        return []
    items = payload.get("menuItem")
    if items is None:
        return []
    if isinstance(items, dict):
        return [items]
    return list(items)


def epa_match_models(menu: list[dict], hints: list[str]) -> list[str]:
    out: list[str] = []
    for item in menu:
        text = str(item.get("text") or "")
        for h in hints:
            if h.lower() in text.lower():
                out.append(text)
                break
    # de-dupe preserve order
    seen: set[str] = set()
    uniq = []
    for t in out:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return uniq[:4]


def mpg_to_raw(
    veh: dict,
    brand: str,
    model: str,
    years: str,
) -> dict | None:
    city = veh.get("city08")
    hwy = veh.get("highway08")
    comb = veh.get("comb08")
    if city is None and hwy is None and comb is None:
        return None
    year = veh.get("year")
    epa_model = veh.get("model")
    fuel = veh.get("fuelType1") or ""
    trany = veh.get("trany") or ""
    vclass = veh.get("VClass") or ""
    drive = veh.get("drive") or ""
    body = (
        f"Official EPA fuel economy for {year} {veh.get('make')} {epa_model}.\n"
        f"Class: {vclass}. Drive: {drive}. Transmission: {trany}. Fuel: {fuel}.\n"
        f"City: {city} mpg. Highway: {hwy} mpg. Combined: {comb} mpg.\n"
        f"These are lab estimates; real-world owner results often vary with climate, "
        f"load, and driving style."
    )
    vid = str(veh.get("id") or "")
    return {
        "source": "EPA FuelEconomy.gov",
        "source_url": f"https://www.fueleconomy.gov/feg/Find.do?action=sbs&id={vid}"
        if vid
        else "https://www.fueleconomy.gov/",
        "brand": brand,
        "model": model,
        "year_range": years,
        "title": f"EPA MPG: {year} {epa_model} ({comb} mpg combined)",
        "body": body,
        "comments": [],
        "score": 8,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "raw_id": raw_id("epa", brand, model, vid, str(comb)),
        "metadata": {
            "kind": "epa_mpg",
            "epa_id": vid,
            "city08": city,
            "highway08": hwy,
            "comb08": comb,
            "year": year,
        },
    }


def harvest_epa(
    client: httpx.Client,
    fh,
    seen: set[str],
    models: list[dict],
    sleep: float,
) -> int:
    written = 0
    headers = {"Accept": "application/json"}
    for m in models:
        brand, model = m["brand"], m["model"]
        years = m.get("year_range", "2023-2025")
        hints = EPA_MODEL_HINTS.get(model) or [model.split()[0]]
        print(f"[epa] {brand} {model} hints={hints}")
        for year in years_from_range(years):
            try:
                r = client.get(
                    EPA_MODEL,
                    params={"year": year, "make": brand},
                    headers=headers,
                    timeout=45.0,
                )
                r.raise_for_status()
                menu = _menu_items(r.json())
                matched = epa_match_models(menu, hints)
            except Exception as exc:
                print(f"  ! menu {year}: {exc}")
                time.sleep(sleep)
                continue
            if not matched:
                print(f"  {year}: no EPA model match")
                time.sleep(sleep)
                continue
            year_kept = 0
            for epa_model_name in matched:
                try:
                    ro = client.get(
                        EPA_OPTIONS,
                        params={"year": year, "make": brand, "model": epa_model_name},
                        headers=headers,
                        timeout=45.0,
                    )
                    ro.raise_for_status()
                    options = _menu_items(ro.json())
                except Exception as exc:
                    print(f"  ! options {epa_model_name}: {exc}")
                    continue
                # sample up to 3 trims
                for opt in options[:3]:
                    vid = str(opt.get("value") or "")
                    if not vid.isdigit():
                        continue
                    try:
                        rv = client.get(
                            f"{EPA_VEHICLE}/{vid}",
                            headers=headers,
                            timeout=45.0,
                        )
                        rv.raise_for_status()
                        veh = rv.json()
                    except Exception as exc:
                        print(f"  ! vehicle {vid}: {exc}")
                        continue
                    item = mpg_to_raw(veh, brand, model, years)
                    if item and write_item(fh, seen, item):
                        written += 1
                        year_kept += 1
                    time.sleep(sleep)
            print(f"  {year}: matched={matched} kept={year_kept}")
            time.sleep(sleep)
    return written


def main() -> int:
    load_dotenv(ROOT.parents[2] / ".env.local")
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit-models", type=int, default=0)
    ap.add_argument("--sleep", type=float, default=0.25)
    ap.add_argument("--replace-raw", action="store_true")
    ap.add_argument(
        "--sources",
        default="recalls,epa",
        help="Comma list: recalls,epa",
    )
    args = ap.parse_args()
    sources = {s.strip().lower() for s in args.sources.split(",") if s.strip()}

    models = json.loads(MODELS.read_text(encoding="utf-8"))
    if args.limit_models:
        models = models[: args.limit_models]

    seen = set() if args.replace_raw else load_existing_raw_ids(RAW_OUT)
    RAW_OUT.parent.mkdir(parents=True, exist_ok=True)
    mode = "w" if args.replace_raw else "a"

    total = 0
    with httpx.Client(
        headers={
            "User-Agent": "GarageGeniusAI/0.1 (internal DIY RAG; public NHTSA/EPA APIs)"
        },
        follow_redirects=True,
        timeout=45.0,
    ) as client, RAW_OUT.open(mode, encoding="utf-8") as fh:
        if "recalls" in sources:
            total += harvest_recalls(client, fh, seen, models, args.sleep)
        if "epa" in sources:
            total += harvest_epa(client, fh, seen, models, args.sleep)

    print(f"\nDone. Wrote {total} new raw rows → {RAW_OUT}")
    print("Next: ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=120")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
