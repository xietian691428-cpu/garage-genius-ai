#!/usr/bin/env python3
"""
Harvest repair-cost estimates → raw_posts.jsonl

Tries RepairPal first (when reachable). Falls back to YourMechanic public
estimate pages (robots-friendly, currently reachable from datacenter IPs).
"""

from __future__ import annotations

import argparse
import re
import sys
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "tools"))

from public_harvest_common import (  # noqa: E402
    RAW_OUT,
    filter_models,
    http_client,
    load_existing_raw_ids,
    load_models,
    make_raw,
    meta_content,
    polite_sleep,
    robots_allows,
    strip_html,
    write_item,
)


def parse_yourmechanic(html: str, url: str, brand: str, model: str, year_range: str) -> list[dict]:
    text = strip_html(html)
    items: list[dict] = []
    # Annual maintenance blurb
    m = re.search(
        r"(The annual cost estimate to maintain a .{10,80}?is approximately \$[\d,]+[^*.]*)",
        text,
        re.I,
    )
    if m:
        body = m.group(1).strip()
        item = make_raw(
            source="YourMechanic",
            source_url=url,
            brand=brand,
            model=model,
            year_range=year_range,
            title=f"{brand} {model} annual maintenance cost estimate",
            body=body + " Source: YourMechanic public estimate page (US).",
            prefix="ym",
            score=12,
            metadata={"kind": "annual_maintenance_cost"},
        )
        if item:
            items.append(item)

    # Service estimate pairs
    pairs = re.findall(
        r"(?:Service type\s+)?([A-Za-z][A-Za-z0-9 /,&-]{4,70}?)\s+"
        r"(?:Replacement )?Estimate\s+\$?([\d,]+(?:\.\d{2})?)",
        text,
    )
    # Clean noisy prefixes
    cleaned: list[tuple[str, str]] = []
    for name, cost in pairs:
        name = re.sub(r"^(?:\dL|lectric|0L)\s+", "", name).strip(" -")
        name = re.sub(r"^Service type\s+", "", name, flags=re.I).strip()
        if len(name) < 5 or float(cost.replace(",", "")) < 20:
            continue
        cleaned.append((name, cost))
    # Prefer common maintenance services
    prefer = (
        "oil",
        "brake",
        "spark",
        "filter",
        "coolant",
        "transmission",
        "battery",
        "alternator",
        "timing",
        "water pump",
        "pad",
        "rotor",
        "fluid",
    )
    cleaned.sort(
        key=lambda x: (0 if any(p in x[0].lower() for p in prefer) else 1, x[0])
    )
    lines = [f"- {n}: about ${c} (estimate)" for n, c in cleaned[:25]]
    if lines:
        body = (
            f"Typical US repair/service cost estimates for {brand} {model} "
            f"(YourMechanic public page):\n" + "\n".join(lines)
        )
        item = make_raw(
            source="YourMechanic",
            source_url=url,
            brand=brand,
            model=model,
            year_range=year_range,
            title=f"{brand} {model} repair and service cost estimates",
            body=body,
            prefix="ym",
            score=10,
            metadata={"kind": "service_cost_list", "n_services": len(lines)},
        )
        if item:
            items.append(item)
    return items


def parse_repairpal(html: str, url: str, brand: str, model: str, year_range: str) -> list[dict]:
    text = strip_html(html)
    desc = meta_content(html, "description") or meta_content(html, "og:description")
    costs = re.findall(r"\$\s?[\d,]+(?:\s*[-–]\s*\$?\s?[\d,]+)?", text)
    if not desc and not costs:
        return []
    body_parts = []
    if desc:
        body_parts.append(unescape(desc))
    if costs:
        body_parts.append("Listed cost figures: " + ", ".join(costs[:20]))
    # Grab sentences mentioning cost/average
    for m in re.finditer(r"([^.?]{0,20}(?:average cost|typical cost|repair cost)[^.?]{10,160}[.!?])", text, re.I):
        body_parts.append(m.group(1).strip())
        if len(body_parts) >= 6:
            break
    body = "\n\n".join(dict.fromkeys(body_parts))
    item = make_raw(
        source="RepairPal",
        source_url=url,
        brand=brand,
        model=model,
        year_range=year_range,
        title=f"{brand} {model} RepairPal cost summary",
        body=body,
        prefix="rp",
        score=11,
        metadata={"kind": "repairpal_cost"},
    )
    return [item] if item else []


def harvest_model(client, fh, seen, m: dict) -> int:
    brand, model = m["brand"], m["model"]
    years = m.get("year_range", "2018-2025")
    written = 0

    # 1) RepairPal (may 403 from datacenter)
    rp = m.get("repairpal")
    if rp:
        url = f"https://repairpal.com/estimator/{rp}"
        ok, msg = robots_allows("https://repairpal.com/robots.txt", url, client)
        print(f"[repaircost] RepairPal {brand} {model}: robots={msg}")
        if ok:
            try:
                r = client.get(url)
                if r.status_code == 200 and b"Access Denied" not in r.content[:500]:
                    for item in parse_repairpal(r.text, url, brand, model, years):
                        if write_item(fh, seen, item):
                            written += 1
                    print(f"  RepairPal OK (+rows)")
                else:
                    print(f"  RepairPal HTTP {r.status_code} — fallback YourMechanic")
            except Exception as e:
                print(f"  RepairPal error {type(e).__name__}: {e}")
        polite_sleep()

    # 2) YourMechanic fallback / primary
    ym = m.get("yourmechanic")
    if ym:
        url = f"https://www.yourmechanic.com/estimates/{ym}/"
        ok, msg = robots_allows("https://www.yourmechanic.com/robots.txt", url, client)
        print(f"[repaircost] YourMechanic {brand} {model}: robots={msg}")
        if ok:
            r = client.get(url)
            if r.status_code == 200:
                for item in parse_yourmechanic(r.text, url, brand, model, years):
                    if write_item(fh, seen, item):
                        written += 1
            else:
                print(f"  YourMechanic HTTP {r.status_code}")
        polite_sleep(1.0, 2.2)
    elif not written:
        print(f"  no YourMechanic slug for {brand} {model}")

    return written


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default=None)
    ap.add_argument("--out", default=str(RAW_OUT))
    args = ap.parse_args()
    models = filter_models(load_models(), args.models)
    if not models:
        print("No models matched")
        return 2
    out = Path(args.out)
    seen = load_existing_raw_ids(out)
    total = 0
    with out.open("a", encoding="utf-8") as fh, http_client() as client:
        for m in models:
            n = harvest_model(client, fh, seen, m)
            print(f"  → +{n} for {m['brand']} {m['model']}")
            total += n
    print(f"Repair-cost harvest done: +{total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
