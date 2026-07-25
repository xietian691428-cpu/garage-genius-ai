#!/usr/bin/env python3
"""
Discover Reddit owner-review threads via web SERP snippets → raw_posts.jsonl

Providers (in order): DuckDuckGo HTML → Bing HTML.
Does NOT scrape Google HTML (ToS / bot walls) and does NOT crawl Reddit
listing pages (robots Disallow: /). Stores SERP title + snippet only.
"""

from __future__ import annotations

import argparse
import re
import sys
from html import unescape
from pathlib import Path
from urllib.parse import quote_plus, unquote, urlparse, parse_qs

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
    write_item,
)

QUERIES = [
    "site:reddit.com {brand} {model} owner review",
    "site:reddit.com {brand} {model} real world mpg",
    "site:reddit.com {brand} {model} maintenance cost",
    "site:reddit.com {brand} {model} problems reliability",
    "site:reddit.com {brand} {model} long term ownership",
]


def _clean(s: str) -> str:
    s = unescape(re.sub(r"<[^>]+>", " ", s or ""))
    s = unescape(s.replace("&#x27;", "'"))
    return re.sub(r"\s+", " ", s).strip()


def _dedupe(rows: list[dict]) -> list[dict]:
    seen: set[str] = set()
    uniq: list[dict] = []
    for row in rows:
        u = (row.get("url") or "").split("?")[0]
        if not u or u in seen:
            continue
        seen.add(u)
        uniq.append(row)
    return uniq


def parse_ddg(html: str) -> list[dict]:
    out: list[dict] = []
    for m in re.finditer(
        r'class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>'
        r'.*?class="result__snippet"[^>]*>(.*?)</(?:a|td|div)',
        html,
        re.S | re.I,
    ):
        href = m.group(1)
        um = re.search(r"uddg=([^&]+)", href)
        url = unquote(um.group(1)) if um else href
        title = _clean(m.group(2))
        snip = _clean(m.group(3))
        if "reddit.com" not in url.lower() and "reddit" not in title.lower():
            continue
        if len(title) < 12 or len(snip) < 40:
            continue
        out.append({"url": url, "title": title, "snippet": snip, "engine": "ddg"})
    if not out:
        for m in re.finditer(r"uddg=([^&\"]+)", html):
            url = unquote(m.group(1))
            if "reddit.com" not in url:
                continue
            out.append(
                {
                    "url": url,
                    "title": "Reddit owner discussion",
                    "snippet": f"Discovered via web search: {url}",
                    "engine": "ddg",
                }
            )
    return _dedupe(out)


def parse_bing(html: str) -> list[dict]:
    out: list[dict] = []
    # Bing result blocks: <li class="b_algo"> ... <h2><a href=...>title</a></h2> ... <p>snip</p>
    for m in re.finditer(
        r'<li[^>]*class="[^"]*b_algo[^"]*"[^>]*>(.*?)</li>',
        html,
        re.S | re.I,
    ):
        block = m.group(1)
        am = re.search(r'<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>(.*?)</a>', block, re.S | re.I)
        if not am:
            continue
        url = am.group(1)
        # unwrap bing redirect /ck/a?...
        if "reddit.com" not in url:
            qm = re.search(r"[?&]u=a1([^&]+)", url)
            if qm:
                # bing encodes url in base64-ish; keep raw if decode fails
                try:
                    import base64

                    pad = "=" * (-len(qm.group(1)) % 4)
                    url = base64.urlsafe_b64decode(qm.group(1) + pad).decode("utf-8", "ignore")
                except Exception:
                    pass
        title = _clean(am.group(2))
        pm = re.search(r"<p[^>]*>(.*?)</p>", block, re.S | re.I)
        snip = _clean(pm.group(1)) if pm else ""
        if "reddit.com" not in url.lower() and "reddit" not in title.lower():
            continue
        if len(title) < 12:
            continue
        if len(snip) < 40:
            snip = f"Reddit discussion discovered via Bing for owner experiences: {title}"
        out.append({"url": url, "title": title, "snippet": snip, "engine": "bing"})
    # Fallback: any reddit hrefs
    if not out:
        for m in re.finditer(r'href="(https://(?:www\.)?reddit\.com/r/[^"]+)"', html):
            url = m.group(1)
            out.append(
                {
                    "url": url,
                    "title": "Reddit owner discussion",
                    "snippet": f"Discovered via Bing: {url}",
                    "engine": "bing",
                }
            )
    return _dedupe(out)


def search_query(client, q: str) -> list[dict]:
    # 1) DuckDuckGo
    ddg_url = "https://html.duckduckgo.com/html/?q=" + quote_plus(q)
    for attempt in range(2):
        try:
            r = client.get(ddg_url, headers={"Referer": "https://duckduckgo.com/"})
        except Exception as e:
            print(f"  ! DDG error {type(e).__name__}: {e}")
            polite_sleep(2.0, 4.0)
            continue
        if r.status_code == 200:
            rows = parse_ddg(r.text)
            if rows:
                return rows
            print("  DDG 200 but 0 parseable hits")
            break
        print(f"  ! DDG HTTP {r.status_code} (attempt {attempt + 1})")
        polite_sleep(2.5, 4.5)

    # 2) Bing fallback
    bing_url = "https://www.bing.com/search?q=" + quote_plus(q) + "&setlang=en-US&count=10"
    try:
        r = client.get(
            bing_url,
            headers={
                "Referer": "https://www.bing.com/",
                "Accept": "text/html,application/xhtml+xml",
            },
        )
    except Exception as e:
        print(f"  ! Bing error {type(e).__name__}: {e}")
        return []
    if r.status_code != 200:
        print(f"  ! Bing HTTP {r.status_code}")
        return []
    rows = parse_bing(r.text)
    if not rows:
        print("  Bing 200 but 0 reddit hits")
    return rows


def harvest_model(client, fh, seen, m: dict, *, per_model: int) -> int:
    brand, model = m["brand"], m["model"]
    written = 0
    print(f"[serp-reddit] {brand} {model}")
    for qtmpl in QUERIES:
        if written >= per_model:
            break
        q = qtmpl.format(brand=brand, model=model)
        rows = search_query(client, q)
        print(f"  query hits={len(rows)} :: {q}")
        for row in rows:
            if written >= per_model:
                break
            body = (
                f"Search query: {q}\n\n"
                f"Engine: {row.get('engine', 'serp')}\n\n"
                f"Reddit thread title: {row['title']}\n\n"
                f"Public SERP snippet: {row['snippet']}\n\n"
                "Note: Snippet-only harvest (no Reddit crawl; robots Disallow: /)."
            )
            item = make_raw(
                source="Web SERP (Reddit)",
                source_url=row["url"],
                brand=brand,
                model=model,
                year_range=m.get("year_range", "2018-2025"),
                title=row["title"][:180],
                body=body,
                prefix="serp",
                score=5,
                metadata={
                    "kind": "serp_reddit_snippet",
                    "query": q,
                    "engine": row.get("engine"),
                },
            )
            if item and write_item(fh, seen, item):
                written += 1
        polite_sleep(2.5, 5.0)
    return written


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default=None)
    ap.add_argument("--per-model", type=int, default=25)
    ap.add_argument("--out", default=str(RAW_OUT))
    args = ap.parse_args()
    models = filter_models(load_models(), args.models)
    if not models:
        print("No models matched")
        return 2
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    seen = load_existing_raw_ids(out)
    # Also skip ids already in main raw file to avoid dupes when appending later
    seen |= load_existing_raw_ids(RAW_OUT)
    total = 0
    with out.open("a", encoding="utf-8") as fh, http_client() as client:
        for m in models:
            n = harvest_model(client, fh, seen, m, per_model=args.per_model)
            print(f"  → +{n} SERP rows for {m['brand']} {m['model']}")
            total += n
            polite_sleep(3.0, 6.0)
    print(f"SERP Reddit discovery done: +{total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
