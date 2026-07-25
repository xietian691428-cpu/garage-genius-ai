#!/usr/bin/env python3
"""
Harvest CarComplaints.com problem reports → raw_posts.jsonl

Public, structured owner fault reports (robots allows model/problem pages).
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
    polite_sleep,
    robots_allows,
    strip_html,
    write_item,
    years_from_range,
)


def cc_paths(m: dict) -> list[str]:
    cc = m.get("carcomplaints")
    if not cc:
        return []
    if isinstance(cc, list):
        return cc
    return [cc]


def harvest_problem_page(client, url: str, brand: str, model: str, year: int | None) -> list[dict]:
    r = client.get(url)
    if r.status_code != 200:
        return []
    html = r.text
    title_m = re.search(r"<title>(.*?)</title>", html, re.I | re.S)
    title = re.sub(r"\s+", " ", unescape(title_m.group(1))).strip() if title_m else url
    # Owner narratives in paragraphs
    paras = [
        re.sub(r"\s+", " ", unescape(strip_html(p))).strip()
        for p in re.findall(r"<p[^>]*>(.*?)</p>", html, re.S | re.I)
    ]
    paras = [p for p in paras if len(p) > 80 and "cookie" not in p.lower()]
    # Deduplicate near-identical
    uniq: list[str] = []
    seen_p: set[str] = set()
    for p in paras:
        key = p[:120].lower()
        if key in seen_p:
            continue
        seen_p.add(key)
        uniq.append(p)
    if not uniq:
        return []
    # Bundle top narratives into one raw item per problem page (high signal)
    body = "\n\n".join(uniq[:8])
    year_range = f"{year}-{year}" if year else "2018-2025"
    item = make_raw(
        source="CarComplaints",
        source_url=url,
        brand=brand,
        model=model,
        year_range=year_range,
        title=title[:180],
        body=body,
        prefix="cc",
        score=min(20, len(uniq) * 2),
        metadata={"kind": "carcomplaints_problem", "year": year, "narratives": len(uniq)},
    )
    return [item] if item else []


def harvest_model(client, fh, seen, m: dict, *, per_model: int, max_years: int) -> int:
    brand, model = m["brand"], m["model"]
    years = sorted(years_from_range(m.get("year_range", "2018-2025")), reverse=True)[
        :max_years
    ]
    written = 0
    for base in cc_paths(m):
        if written >= per_model:
            break
        index_url = f"https://www.carcomplaints.com/{base}/"
        ok, msg = robots_allows(
            "https://www.carcomplaints.com/robots.txt", index_url, client
        )
        if not ok:
            print(f"  skip {base}: {msg}")
            continue
        print(f"[carcomplaints] {brand} {model} via {base} ({msg})")
        r = client.get(index_url)
        if r.status_code != 200:
            print(f"  ! index HTTP {r.status_code}")
            continue
        polite_sleep()
        for year in years:
            if written >= per_model:
                break
            year_url = f"https://www.carcomplaints.com/{base}/{year}/"
            yr = client.get(year_url)
            if yr.status_code != 200:
                continue
            probs = sorted(
                set(
                    re.findall(
                        rf'href="(/{re.escape(base)}/{year}/[^"]+\.shtml)"', yr.text
                    )
                )
            )
            print(f"  {year}: {len(probs)} problem pages")
            for rel in probs:
                if written >= per_model:
                    break
                url = "https://www.carcomplaints.com" + rel
                for item in harvest_problem_page(client, url, brand, model, year):
                    if write_item(fh, seen, item):
                        written += 1
                polite_sleep(0.8, 1.8)
            # Also category overview pages linked from model index
            polite_sleep()
    return written


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default=None)
    ap.add_argument("--per-model", type=int, default=40)
    ap.add_argument("--max-years", type=int, default=6)
    ap.add_argument("--out", default=str(RAW_OUT))
    args = ap.parse_args()

    models = filter_models(load_models(), args.models)
    if not models:
        print("No models matched")
        return 2
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    seen = load_existing_raw_ids(out)
    total = 0
    with out.open("a", encoding="utf-8") as fh, http_client() as client:
        for m in models:
            n = harvest_model(
                client, fh, seen, m, per_model=args.per_model, max_years=args.max_years
            )
            print(f"  → +{n} for {m['brand']} {m['model']}")
            total += n
    print(f"CarComplaints done: +{total}")
    return 0 if total >= 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
