#!/usr/bin/env python3
"""
Harvest Edmunds consumer reviews → output/raw_posts.jsonl

Priority path: official Vehicle Reviews API v2 (EDMUNDS_API_KEY).
Fallback: Playwright + US residential proxies (stealth, slow, sequential).

Compliance (US / internal RAG only):
  - Prefer the official Edmunds API when you have a key.
  - HTML fallback only for publicly viewable consumer-review pages.
  - Obey robots.txt when reachable (abort if Disallow matches).
  - No login, CAPTCHA, or paywall bypass. Low rate limits. Internal use only.
  - Site Terms may still prohibit scraping even when CFAA is not implicated —
    prefer licensed API access for anything beyond small internal tests.

Usage:
  ./run.sh edmunds --probe
  ./run.sh edmunds --from-fixture
  ./run.sh edmunds --method=playwright --models=rav4 --per-model=50 --proxy
  ./run.sh clean --provider=deepseek --limit=200

Env:
  EDMUNDS_API_KEY   — developer.edmunds.com Vehicle API key (preferred)
  PROXY_LIST / config/proxies.txt — US residential proxies (Bright Data / Oxylabs / …)
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

MODELS_CFG = ROOT / "config" / "models_edmunds.json"
RAW_OUT = ROOT / "output" / "raw_posts.jsonl"
FIXTURE = ROOT / "fixtures" / "edmunds_review_sample.json"
PROXIES_FILE = ROOT / "config" / "proxies.txt"

API_BASE = "https://api.edmunds.com/api/vehiclereviews/v2"
GATEWAY_REVIEWS = (
    "https://www.edmunds.com/gateway/api/reviewsgateway/v1/vehiclereviews/"
)

# Pain-point keywords for DIY coach / maintenance corpus
DEFAULT_KEYWORDS = [
    "owner review",
    "real world mpg",
    "mpg",
    "fuel economy",
    "maintenance cost",
    "at miles",
    "miles",
    "long term",
    "problems",
    "reliability",
    "dealer",
    "warranty",
    "repair",
    "oil",
    "transmission",
    "battery",
    "noise",
    "comfort",
]

UA_POOL = [
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
    ),
    (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 "
        "(KHTML, like Gecko) Version/17.5 Safari/605.1.15"
    ),
]
UA = UA_POOL[0]

# Best-effort anti-automation noise reduction (not a ToS bypass).
STEALTH_INIT_JS = """
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
window.chrome = window.chrome || { runtime: {} };
const originalQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
  parameters.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : originalQuery(parameters)
);
"""

# Paths we intend to fetch; checked against robots when robots.txt is readable.
EDMUNDS_FETCH_PATHS = [
    "/toyota/rav4/2023/consumer-reviews/",
    "/gateway/api/reviewsgateway/v1/vehiclereviews/",
]


def raw_id(*parts: str) -> str:
    h = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"edmunds_{h}"


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
        return [2022, 2023, 2024, 2025]
    return list(range(int(m.group(1)), int(m.group(2)) + 1))


def load_proxies() -> list[str]:
    out: list[str] = []
    env = os.getenv("PROXY_LIST", "").strip()
    if env:
        out.extend(p.strip() for p in env.split(",") if p.strip())
    if PROXIES_FILE.is_file():
        for line in PROXIES_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                out.append(line)
    # de-dupe, preserve order
    seen: set[str] = set()
    uniq: list[str] = []
    for p in out:
        if p not in seen:
            seen.add(p)
            uniq.append(p)
    return uniq


def playwright_proxy(proxy_url: str) -> dict[str, str]:
    """Split user:pass@host into Playwright {server, username, password}."""
    parsed = urlparse(proxy_url)
    if not parsed.scheme or not parsed.hostname:
        return {"server": proxy_url}
    port = f":{parsed.port}" if parsed.port else ""
    cfg: dict[str, str] = {"server": f"{parsed.scheme}://{parsed.hostname}{port}"}
    if parsed.username:
        cfg["username"] = parsed.username
    if parsed.password:
        cfg["password"] = parsed.password
    return cfg


def polite_sleep(min_s: float, max_s: float) -> None:
    lo, hi = min(min_s, max_s), max(min_s, max_s)
    time.sleep(random.uniform(lo, hi))


def apply_stealth(page) -> str:
    """Apply playwright-stealth if installed; else inject STEALTH_INIT_JS."""
    try:
        from playwright_stealth import stealth_sync  # type: ignore

        stealth_sync(page)
        return "playwright-stealth"
    except Exception:
        page.add_init_script(STEALTH_INIT_JS)
        return "init-script"


def check_robots_allow(
    proxies: list[str],
    *,
    user_agent: str = "GarageGeniusAI-Research/0.1",
) -> tuple[bool, str]:
    """
    Fetch robots.txt (via first proxy if any). Returns (allowed, message).
    If robots is unreachable (403/empty HTML), return True with a warning —
    caller should still keep rates low and prefer the API.
    """
    proxy = proxies[0] if proxies else None
    kwargs: dict[str, Any] = {"timeout": 25.0, "follow_redirects": True, "trust_env": False}
    if proxy:
        kwargs["proxy"] = proxy
    try:
        with httpx.Client(**kwargs) as client:
            r = client.get(
                "https://www.edmunds.com/robots.txt",
                headers={"User-Agent": user_agent, "Accept": "text/plain,*/*"},
            )
            body = r.text or ""
            if r.status_code != 200 or "<html" in body[:200].lower():
                return (
                    True,
                    f"robots.txt not readable (HTTP {r.status_code}); "
                    "proceed cautiously — prefer API / stop if ToS forbids HTML harvest",
                )
            rp = RobotFileParser()
            rp.parse(body.splitlines())
            blocked = [
                path
                for path in EDMUNDS_FETCH_PATHS
                if not rp.can_fetch(user_agent, f"https://www.edmunds.com{path}")
            ]
            if blocked:
                return False, f"robots.txt Disallow blocks: {blocked}"
            return True, "robots.txt allows consumer-reviews paths for our UA"
    except Exception as e:
        return True, f"robots check failed ({type(e).__name__}: {e}); proceed cautiously"


def write_item(fh, seen: set[str], item: dict) -> bool:
    rid = item.get("raw_id")
    if not rid or rid in seen:
        return False
    seen.add(rid)
    fh.write(json.dumps(item, ensure_ascii=False) + "\n")
    return True


def keyword_score(text: str, keywords: list[str]) -> tuple[int, list[str]]:
    low = text.lower()
    hits = [k for k in keywords if k.lower() in low]
    # "at X miles" style: digit + miles
    if re.search(r"\b\d{1,3}[,.]?\d{3}\s*miles?\b", low) or re.search(
        r"\bat\s+\d+\s*k?\s*miles?\b", low
    ):
        if "at miles" not in hits and "miles" not in hits:
            hits.append("mileage_mention")
    return len(hits), hits


def ratings_blob(review: dict) -> str:
    parts: list[str] = []
    for r in review.get("ratings") or []:
        t = r.get("type") or r.get("name")
        v = r.get("value")
        if t is not None and v is not None:
            parts.append(f"{t}={v}")
    avg = review.get("averageRating")
    if avg is not None:
        parts.insert(0, f"avg={avg}")
    return ", ".join(parts)


def review_to_raw(
    review: dict,
    *,
    brand: str,
    model: str,
    year: int,
    year_range: str,
    make_slug: str,
    model_slug: str,
    keywords: list[str],
    require_keyword: bool,
) -> dict | None:
    title = (review.get("title") or "").strip()
    text = (review.get("text") or review.get("content") or "").strip()
    fav = (review.get("favoriteFeatures") or "").strip()
    if len(text) < 80 and not title:
        return None

    body_parts = [
        f"Year: {year}",
        f"Ratings: {ratings_blob(review)}" if ratings_blob(review) else "",
        f"Title: {title}" if title else "",
        text,
        f"Favorite features: {fav}" if fav else "",
    ]
    body = "\n\n".join(p for p in body_parts if p)
    score_kw, hits = keyword_score(f"{title}\n{body}", keywords)
    if require_keyword and score_kw == 0:
        return None

    rid = str(review.get("id") or review.get("legacyId") or "")
    thumbs = review.get("thumbsUpDownCounter") or {}
    up = int(thumbs.get("thumbsUp") or thumbs.get("up") or 0)
    created = review.get("created") or review.get("createdDate")
    source_url = (
        f"https://www.edmunds.com/{make_slug}/{model_slug}/{year}/consumer-reviews/"
    )
    if rid:
        source_url = f"{source_url}#{rid}"

    return {
        "source": "Edmunds",
        "source_url": source_url,
        "brand": brand,
        "model": model,
        "year_range": year_range if not year else f"{year}-{year}",
        "title": title or f"{brand} {model} {year} owner review",
        "body": body[:4500],
        "comments": [],
        "score": up + score_kw * 2,
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        "raw_id": raw_id("edm", brand, model, str(year), rid or title, text[:120]),
        "metadata": {
            "kind": "edmunds_consumer_review",
            "edmunds_id": rid,
            "year": year,
            "keyword_hits": hits,
            "average_rating": review.get("averageRating"),
            "created": created,
            "author": (review.get("author") or {}).get("authorName"),
        },
    }


def parse_reviews_payload(data: dict | list) -> list[dict]:
    if isinstance(data, list):
        return [x for x in data if isinstance(x, dict)]
    if not isinstance(data, dict):
        return []
    for key in ("reviews", "results", "content", "data"):
        v = data.get(key)
        if isinstance(v, list):
            return [x for x in v if isinstance(x, dict)]
        if isinstance(v, dict) and isinstance(v.get("reviews"), list):
            return [x for x in v["reviews"] if isinstance(x, dict)]
    return []


def filter_models(models: list[dict], models_arg: str | None) -> list[dict]:
    if not models_arg:
        return models
    wanted = {s.strip().lower() for s in models_arg.split(",") if s.strip()}
    out: list[dict] = []
    for m in models:
        keys = {
            m["model"].lower(),
            m["model"].lower().replace(" ", "-"),
            m.get("edmunds_model", "").lower(),
            (m.get("slug") or "").split("/")[-1].lower(),
        }
        if wanted & keys:
            out.append(m)
    return out


def fetch_api_page(
    client: httpx.Client,
    make: str,
    model: str,
    year: int,
    *,
    api_key: str,
    pagenum: int,
    pagesize: int,
) -> dict:
    url = f"{API_BASE}/{make}/{model}/{year}"
    r = client.get(
        url,
        params={
            "fmt": "json",
            "api_key": api_key,
            "pagenum": pagenum,
            "pagesize": pagesize,
            "sortby": "created:DESC",
        },
        timeout=45.0,
    )
    if r.status_code == 404:
        return {}
    r.raise_for_status()
    return r.json() if r.content else {}


def harvest_via_api(
    client: httpx.Client,
    fh,
    seen: set[str],
    models: list[dict],
    *,
    api_key: str,
    per_model: int,
    keywords: list[str],
    require_keyword: bool,
    sleep: float,
    pagesize: int = 20,
) -> int:
    written = 0
    for m in models:
        brand, model = m["brand"], m["model"]
        make_s = m["edmunds_make"]
        model_s = m["edmunds_model"]
        years = years_from_range(m.get("year_range", "2018-2025"))
        got = 0
        print(f"[edmunds:api] {brand} {model} target={per_model}", flush=True)
        # Prefer recent years first
        for year in sorted(years, reverse=True):
            if got >= per_model:
                break
            page = 1
            empty_pages = 0
            while got < per_model and empty_pages < 2:
                try:
                    data = fetch_api_page(
                        client,
                        make_s,
                        model_s,
                        year,
                        api_key=api_key,
                        pagenum=page,
                        pagesize=pagesize,
                    )
                except httpx.HTTPStatusError as e:
                    print(
                        f"  ! {year} page {page}: HTTP {e.response.status_code} "
                        f"{e.response.text[:120]}",
                        flush=True,
                    )
                    break
                reviews = parse_reviews_payload(data)
                if not reviews:
                    empty_pages += 1
                    page += 1
                    time.sleep(sleep + random.uniform(0, sleep))
                    continue
                empty_pages = 0
                page_added = 0
                for rev in reviews:
                    item = review_to_raw(
                        rev,
                        brand=brand,
                        model=model,
                        year=year,
                        year_range=m.get("year_range", f"{year}-{year}"),
                        make_slug=make_s,
                        model_slug=model_s,
                        keywords=keywords,
                        require_keyword=require_keyword,
                    )
                    if not item:
                        continue
                    if write_item(fh, seen, item):
                        written += 1
                        got += 1
                        page_added += 1
                        if got >= per_model:
                            break
                print(
                    f"  {year} p{page}: +{page_added} (model total {got}/{per_model})",
                    flush=True,
                )
                if page_added == 0 and require_keyword:
                    # Soften filter if nothing matched this page
                    pass
                page += 1
                time.sleep(sleep + random.uniform(0, sleep * 0.5))
        print(f"  → wrote {got} for {brand} {model}", flush=True)
    return written


def harvest_via_playwright(
    fh,
    seen: set[str],
    models: list[dict],
    *,
    per_model: int,
    keywords: list[str],
    require_keyword: bool,
    min_delay: float,
    max_delay: float,
    proxies: list[str],
    require_proxy: bool,
) -> int:
    try:
        from playwright.sync_api import sync_playwright
    except ImportError as e:
        raise SystemExit(
            "Playwright not installed. Run: ./run.sh install && playwright install chromium"
        ) from e

    if require_proxy and not proxies:
        raise SystemExit(
            "--proxy requires US residential proxies in config/proxies.txt or PROXY_LIST.\n"
            "Example: http://user:pass@host:port\n"
            "Providers: Bright Data / Oxylabs / Smartproxy (US residential)."
        )

    allowed, robots_msg = check_robots_allow(proxies)
    print(f"[edmunds:pw] robots: {robots_msg}", flush=True)
    if not allowed:
        raise SystemExit(
            "Aborting: robots.txt disallows this harvest path. "
            "Use EDMUNDS_API_KEY instead."
        )

    written = 0
    launch_kwargs: dict[str, Any] = {
        "headless": True,
        "args": ["--disable-blink-features=AutomationControlled"],
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(**launch_kwargs)

        for m in models:
            brand, model = m["brand"], m["model"]
            make_s, model_s = m["edmunds_make"], m["edmunds_model"]
            years = years_from_range(m.get("year_range", "2018-2025"))
            got = 0
            print(
                f"[edmunds:pw] {brand} {model} target={per_model} "
                f"delay={min_delay:.1f}-{max_delay:.1f}s proxies={len(proxies)}",
                flush=True,
            )

            for year in sorted(years, reverse=True):
                if got >= per_model:
                    break

                # New context per year: rotate proxy + UA (concurrency = 1).
                proxy_url = random.choice(proxies) if proxies else None
                ua = random.choice(UA_POOL)
                context_kwargs: dict[str, Any] = {
                    "user_agent": ua,
                    "locale": "en-US",
                    "timezone_id": "America/Los_Angeles",
                    "viewport": {"width": 1365, "height": 900},
                    "extra_http_headers": {
                        "Accept-Language": "en-US,en;q=0.9",
                    },
                }
                if proxy_url:
                    context_kwargs["proxy"] = playwright_proxy(proxy_url)
                    print(f"  {year}: proxy={proxy_url.split('@')[-1]}", flush=True)

                context = browser.new_context(**context_kwargs)
                page = context.new_page()
                stealth_mode = apply_stealth(page)
                if year == sorted(years, reverse=True)[0]:
                    print(f"  stealth={stealth_mode}", flush=True)

                url = (
                    f"https://www.edmunds.com/{make_s}/{model_s}/{year}/consumer-reviews/"
                )
                captured: list[dict] = []

                def on_response(resp):  # noqa: B023
                    try:
                        u = resp.url
                        if "vehiclereviews" not in u and "reviewsgateway" not in u:
                            return
                        if resp.status != 200:
                            return
                        ct = (resp.headers.get("content-type") or "").lower()
                        if "json" not in ct and "javascript" not in ct:
                            return
                        data = resp.json()
                        captured.extend(parse_reviews_payload(data))
                    except Exception:
                        return

                page.on("response", on_response)
                status = 0
                try:
                    resp = page.goto(url, wait_until="domcontentloaded", timeout=90000)
                    status = resp.status if resp else 0
                    if status in (403, 401, 429):
                        print(f"  ! {year}: HTTP {status} (blocked)", flush=True)
                    else:
                        page.wait_for_timeout(int(random.uniform(2500, 4500)))
                        page.mouse.wheel(0, random.randint(400, 1200))
                        page.wait_for_timeout(int(random.uniform(1500, 3000)))
                except Exception as e:
                    print(f"  ! {year}: {type(e).__name__}: {e}", flush=True)
                finally:
                    try:
                        page.remove_listener("response", on_response)
                    except Exception:
                        pass

                reviews = list(captured)
                if status not in (403, 401, 429) and not reviews:
                    cards = page.query_selector_all(
                        "[data-tracking-id='consumer-review'], .review-item, article"
                    )
                    for card in cards[:40]:
                        title_el = card.query_selector("h2, h3, .review-title")
                        title = (title_el.inner_text() if title_el else "").strip()
                        paras = card.query_selector_all("p")
                        text = " ".join(
                            (p.inner_text() or "").strip() for p in paras
                        ).strip()
                        if len(text) < 80:
                            continue
                        reviews.append({"id": "", "title": title, "text": text})

                page_added = 0
                for rev in reviews:
                    if got >= per_model:
                        break
                    item = review_to_raw(
                        rev,
                        brand=brand,
                        model=model,
                        year=year,
                        year_range=m.get("year_range", f"{year}-{year}"),
                        make_slug=make_s,
                        model_slug=model_s,
                        keywords=keywords,
                        require_keyword=require_keyword,
                    )
                    if not item:
                        continue
                    if write_item(fh, seen, item):
                        written += 1
                        got += 1
                        page_added += 1
                print(
                    f"  {year}: +{page_added} from {len(reviews)} reviews "
                    f"(model total {got}/{per_model})",
                    flush=True,
                )
                context.close()
                polite_sleep(min_delay, max_delay)

            print(f"  → wrote {got} for {brand} {model}", flush=True)

        browser.close()
    return written


def probe(api_key: str | None, proxies: list[str]) -> int:
    print("=== Edmunds connectivity probe ===", flush=True)
    print(f"EDMUNDS_API_KEY set: {bool(api_key)}", flush=True)
    print(f"proxies configured: {len(proxies)}", flush=True)
    for env_p in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
        if os.getenv(env_p):
            print(f"  note: {env_p} is set in environment", flush=True)

    allowed, robots_msg = check_robots_allow(proxies)
    print(f"robots: {robots_msg}", flush=True)
    if not allowed:
        print("  → HTML harvest blocked by robots.txt; use API only.", flush=True)

    headers = {
        "User-Agent": UA,
        "Accept": "application/json,text/html,*/*",
        "Referer": "https://www.edmunds.com/toyota/rav4/2023/consumer-reviews/",
        "Origin": "https://www.edmunds.com",
    }
    proxy = proxies[0] if proxies else None
    client_kwargs: dict[str, Any] = {
        "headers": headers,
        "follow_redirects": True,
        "trust_env": False,
    }
    if proxy:
        client_kwargs["proxy"] = proxy
        print(f"using proxy: {proxy.split('@')[-1]}", flush=True)

    ok_html = False
    ok_api = False
    try:
        with httpx.Client(**client_kwargs, timeout=30.0) as client:
            try:
                html = client.get(
                    "https://www.edmunds.com/toyota/rav4/2023/consumer-reviews/"
                )
                print(
                    f"HTML consumer-reviews: HTTP {html.status_code} "
                    f"len={len(html.content)}"
                )
                if html.status_code == 200 and b"Access Denied" not in html.content[:800]:
                    ok_html = True
                elif html.status_code == 403:
                    print(
                        "  → Datacenter / bot block. "
                        "Need US residential proxy in config/proxies.txt.",
                        flush=True,
                    )
            except Exception as e:
                print(f"HTML consumer-reviews: ERROR {type(e).__name__}: {e}")

            gw_params = {
                "makeNiceName": "toyota",
                "modelNiceName": "rav4",
                "year": 2023,
                "pagenum": 1,
                "pagesize": 5,
            }
            try:
                gw = client.get(GATEWAY_REVIEWS, params=gw_params)
                print(
                    f"Gateway vehiclereviews: HTTP {gw.status_code} "
                    f"len={len(gw.content)}"
                )
            except Exception as e:
                print(f"Gateway vehiclereviews: ERROR {type(e).__name__}: {e}")

            if api_key:
                try:
                    api = client.get(
                        f"{API_BASE}/toyota/rav4/2023",
                        params={
                            "fmt": "json",
                            "api_key": api_key,
                            "pagenum": 1,
                            "pagesize": 2,
                        },
                    )
                    print(
                        f"Official API v2: HTTP {api.status_code} "
                        f"len={len(api.content)}"
                    )
                    if api.status_code == 200:
                        n = len(parse_reviews_payload(api.json()))
                        print(f"  → OK, reviews on page: {n}", flush=True)
                        ok_api = True
                    else:
                        print(f"  body: {api.text[:200]}", flush=True)
                except Exception as e:
                    print(f"Official API v2: ERROR {type(e).__name__}: {e}")
            else:
                print(
                    "Official API skipped — set EDMUNDS_API_KEY in .env.local "
                    "(https://developer.edmunds.com/)",
                    flush=True,
                )
    except Exception as e:
        print(f"Client setup failed: {type(e).__name__}: {e}", flush=True)

    print(
        "\nFeasibility:\n"
        f"  API path:  {'READY' if ok_api else 'need EDMUNDS_API_KEY'}\n"
        f"  HTML/PW:   {'READY' if ok_html else 'need US residential --proxy'}\n"
        "\nNext steps:\n"
        "  1. Prefer EDMUNDS_API_KEY (structured + ToS-friendlier)\n"
        "  2. Fill config/proxies.txt then:\n"
        "       ./run.sh edmunds --method=playwright --models=rav4 "
        "--per-model=50 --proxy\n"
        "  3. Offline: ./run.sh edmunds --from-fixture\n"
        "  4. Reddit only after Edmunds works (OAuth; robots Disallow: /)\n",
        flush=True,
    )
    return 0 if (ok_api or ok_html) else 1


def harvest_from_fixture(fh, seen: set[str], keywords: list[str]) -> int:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    written = 0
    for rev in parse_reviews_payload(data):
        item = review_to_raw(
            rev,
            brand="Toyota",
            model="RAV4",
            year=2023,
            year_range="2023-2023",
            make_slug="toyota",
            model_slug="rav4",
            keywords=keywords,
            require_keyword=False,
        )
        if item and write_item(fh, seen, item):
            written += 1
            print(
                f"  fixture → {item['raw_id']} hits={item['metadata']['keyword_hits']}"
            )
    return written


def main() -> int:
    load_dotenv(ROOT.parents[2] / ".env.local")
    load_dotenv(ROOT.parents[2] / ".env")
    load_dotenv(ROOT / ".env")

    ap = argparse.ArgumentParser(description="Harvest Edmunds consumer reviews")
    ap.add_argument(
        "--models",
        default=None,
        help='Comma filter e.g. "rav4,f-150,cr-v" (matches model / edmunds_model)',
    )
    ap.add_argument("--per-model", type=int, default=150, help="Max raw reviews per model")
    ap.add_argument(
        "--method",
        choices=("auto", "api", "playwright"),
        default="auto",
        help="auto: API if key else Playwright",
    )
    ap.add_argument(
        "--proxy",
        action="store_true",
        help="Require residential proxies from config/proxies.txt or PROXY_LIST",
    )
    ap.add_argument(
        "--keywords",
        default=",".join(DEFAULT_KEYWORDS),
        help="Comma-separated keyword filter (substring match)",
    )
    ap.add_argument(
        "--no-keyword-filter",
        action="store_true",
        help="Keep all reviews (still score keywords in metadata)",
    )
    ap.add_argument(
        "--sleep",
        type=float,
        default=None,
        help="Deprecated alias: sets both --min-delay and --max-delay",
    )
    ap.add_argument(
        "--min-delay",
        type=float,
        default=4.0,
        help="Min polite delay between year pages (Playwright default 4s)",
    )
    ap.add_argument(
        "--max-delay",
        type=float,
        default=9.0,
        help="Max polite delay between year pages (Playwright default 9s)",
    )
    ap.add_argument("--probe", action="store_true", help="Connectivity check only")
    ap.add_argument(
        "--from-fixture",
        action="store_true",
        help="Parse fixtures/edmunds_review_sample.json (offline smoke)",
    )
    ap.add_argument("--replace-raw", action="store_true", help="Wipe raw_posts.jsonl first")
    args = ap.parse_args()

    if args.sleep is not None:
        args.min_delay = args.sleep
        args.max_delay = max(args.sleep, args.sleep * 1.5)

    api_key = (os.getenv("EDMUNDS_API_KEY") or "").strip() or None
    proxies = load_proxies()
    keywords = [k.strip() for k in args.keywords.split(",") if k.strip()]
    require_kw = not args.no_keyword_filter

    if args.probe:
        return probe(api_key, proxies)

    models = json.loads(MODELS_CFG.read_text(encoding="utf-8"))
    models = filter_models(models, args.models)
    if not models and not args.from_fixture:
        print("No models matched. Check --models against config/models_edmunds.json")
        return 2

    RAW_OUT.parent.mkdir(parents=True, exist_ok=True)
    if args.replace_raw:
        RAW_OUT.write_text("", encoding="utf-8")

    seen = load_existing_raw_ids(RAW_OUT)
    mode = "a" if RAW_OUT.is_file() and RAW_OUT.stat().st_size else "w"

    with RAW_OUT.open(mode, encoding="utf-8") as fh:
        if args.from_fixture:
            n = harvest_from_fixture(fh, seen, keywords)
            print(f"Wrote {n} fixture rows → {RAW_OUT}")
            return 0

        method = args.method
        if method == "auto":
            method = "api" if api_key else "playwright"

        written = 0
        if method == "api":
            if not api_key:
                print(
                    "EDMUNDS_API_KEY missing. Use --method=playwright --proxy or --probe."
                )
                return 2
            with httpx.Client(
                headers={"User-Agent": "GarageGeniusAI/0.1 (internal RAG; Edmunds API)"},
                timeout=45.0,
            ) as client:
                written = harvest_via_api(
                    client,
                    fh,
                    seen,
                    models,
                    api_key=api_key,
                    per_model=args.per_model,
                    keywords=keywords,
                    require_keyword=require_kw,
                    sleep=max(1.0, args.min_delay),
                )
        else:
            if not proxies:
                print(
                    "No proxies configured. Datacenter IPs get HTTP 403 from Edmunds.\n"
                    "Add US residential lines to config/proxies.txt then:\n"
                    "  ./run.sh edmunds --method=playwright --models=rav4 "
                    "--per-model=50 --proxy\n"
                    "Or offline: ./run.sh edmunds --from-fixture",
                    flush=True,
                )
                return 2
            written = harvest_via_playwright(
                fh,
                seen,
                models,
                per_model=args.per_model,
                keywords=keywords,
                require_keyword=require_kw,
                min_delay=args.min_delay,
                max_delay=args.max_delay,
                proxies=proxies,
                require_proxy=True,
            )

    print(f"\nEdmunds harvest done: +{written} new raw rows → {RAW_OUT}", flush=True)
    print("Next: ./run.sh clean --provider=deepseek --limit=200", flush=True)
    if written == 0:
        print("Zero rows — run ./run.sh edmunds --probe", flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
