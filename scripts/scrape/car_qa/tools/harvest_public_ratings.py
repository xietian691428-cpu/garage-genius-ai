#!/usr/bin/env python3
"""
Harvest public ratings / summaries → raw_posts.jsonl

- Consumer Reports: public meta + free teaser text only (no paywall bypass)
- IIHS: public crash-test summary pages
- J.D. Power: attempted; often 403 from datacenter IPs (soft-skip)
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
    years_from_range,
)


def harvest_cr(client, fh, seen, m: dict) -> int:
    path = m.get("cr_path")
    if not path:
        return 0
    url = f"https://www.consumerreports.org/cars/{path}/"
    ok, msg = robots_allows("https://www.consumerreports.org/robots.txt", url, client)
    print(f"[ratings] CR {m['brand']} {m['model']}: {msg}")
    if not ok:
        return 0
    r = client.get(url)
    if r.status_code != 200:
        print(f"  CR HTTP {r.status_code}")
        return 0
    html = r.text
    desc = meta_content(html, "description") or meta_content(html, "og:description")
    text = strip_html(html)
    snippets: list[str] = []
    if desc:
        snippets.append(unescape(desc))
    # Public teaser sentences only (avoid membership CTAs as body)
    for pat in [
        r"([^.?]{0,30}predicted reliability[^.?]{10,180}[.!?])",
        r"([^.?]{0,30}owner satisfaction[^.?]{10,180}[.!?])",
        r"([^.?]{0,30}road test[^.?]{10,160}[.!?])",
        r"([^.?]{0,20}reliability[^.?]{10,160}[.!?])",
    ]:
        for mobj in re.finditer(pat, text, re.I):
            s = mobj.group(1).strip()
            if "become a member" in s.lower() or "subscribe" in s.lower():
                continue
            if len(s) > 40:
                snippets.append(s)
            if len(snippets) >= 6:
                break
        if len(snippets) >= 6:
            break
    # Dedup
    body = "\n\n".join(dict.fromkeys(snippets))
    if len(body) < 80:
        return 0
    item = make_raw(
        source="Consumer Reports",
        source_url=url,
        brand=m["brand"],
        model=m["model"],
        year_range=m.get("year_range", "2018-2025"),
        title=f"{m['brand']} {m['model']} — Consumer Reports public summary",
        body=body
        + "\n\nNote: Public teaser/summary only; full CR scores require membership.",
        prefix="cr",
        score=8,
        metadata={"kind": "cr_public_teaser"},
    )
    return 1 if item and write_item(fh, seen, item) else 0


def harvest_iihs(client, fh, seen, m: dict) -> int:
    slug = m.get("iihs")
    if not slug:
        return 0
    # Prefer a recent year in range
    years = sorted(years_from_range(m.get("year_range", "2020-2024")), reverse=True)
    written = 0
    for year in years[:4]:
        url = f"https://www.iihs.org/ratings/vehicle/{slug}/{year}"
        ok, msg = robots_allows("https://www.iihs.org/robots.txt", url, client)
        if not ok:
            print(f"  IIHS robots block: {msg}")
            return written
        r = client.get(url)
        if r.status_code != 200:
            continue
        html = r.text
        desc = meta_content(html, "description") or meta_content(html, "og:description")
        text = strip_html(html)
        # Rating words counts as coarse signal
        counts = {
            k: len(re.findall(rf"\b{k}\b", text, re.I))
            for k in ("Good", "Acceptable", "Marginal", "Poor", "Top Safety Pick")
        }
        body_parts = []
        if desc:
            body_parts.append(unescape(desc))
        body_parts.append(
            "IIHS rating keyword counts on public page: "
            + ", ".join(f"{k}={v}" for k, v in counts.items() if v)
        )
        # Grab a few rating-related sentences
        for mobj in re.finditer(
            r"([^.?]{0,20}(?:Top Safety Pick|overall|headlights|side)[^.?]{10,160}[.!?])",
            text,
            re.I,
        ):
            s = mobj.group(1).strip()
            if len(s) > 40:
                body_parts.append(s)
            if len(body_parts) >= 5:
                break
        body = "\n\n".join(dict.fromkeys(body_parts))
        item = make_raw(
            source="IIHS",
            source_url=url,
            brand=m["brand"],
            model=m["model"],
            year_range=f"{year}-{year}",
            title=f"{year} {m['brand']} {m['model']} IIHS public ratings summary",
            body=body,
            prefix="iihs",
            score=9,
            metadata={"kind": "iihs_public", "year": year, "counts": counts},
        )
        if item and write_item(fh, seen, item):
            written += 1
            print(f"  IIHS {year} OK")
            break  # one year enough per model for summary
        polite_sleep(0.6, 1.2)
    return written


def harvest_jdp(client, fh, seen, m: dict) -> int:
    # Soft attempt — often blocked
    slug = (m.get("cr_path") or "").replace("_", "-")
    if not slug:
        return 0
    url = f"https://www.jdpower.com/cars/{slug}"
    r = client.get(url)
    print(f"[ratings] J.D. Power {m['brand']} {m['model']}: HTTP {r.status_code}")
    if r.status_code != 200 or b"Access Denied" in r.content[:800]:
        return 0
    desc = meta_content(r.text, "description") or meta_content(r.text, "og:description")
    text = strip_html(r.text)
    snippets = []
    if desc:
        snippets.append(unescape(desc))
    for mobj in re.finditer(
        r"([^.?]{0,25}(?:quality|reliability|rating|award)[^.?]{10,160}[.!?])",
        text,
        re.I,
    ):
        snippets.append(mobj.group(1).strip())
        if len(snippets) >= 5:
            break
    body = "\n\n".join(dict.fromkeys(s for s in snippets if len(s) > 40))
    item = make_raw(
        source="J.D. Power",
        source_url=url,
        brand=m["brand"],
        model=m["model"],
        year_range=m.get("year_range", "2018-2025"),
        title=f"{m['brand']} {m['model']} — J.D. Power public summary",
        body=body,
        prefix="jdp",
        score=7,
        metadata={"kind": "jdp_public"},
    )
    return 1 if item and write_item(fh, seen, item) else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default=None)
    ap.add_argument("--out", default=str(RAW_OUT))
    ap.add_argument("--skip-jdp", action="store_true")
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
            n = 0
            n += harvest_cr(client, fh, seen, m)
            polite_sleep()
            n += harvest_iihs(client, fh, seen, m)
            polite_sleep()
            if not args.skip_jdp:
                n += harvest_jdp(client, fh, seen, m)
                polite_sleep(0.8, 1.5)
            print(f"  → +{n} ratings rows for {m['brand']} {m['model']}")
            total += n
    print(f"Public ratings done: +{total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
