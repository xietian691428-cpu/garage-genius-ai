"""
Car owner Q&A harvester — Reddit (JSON) + Edmunds (Playwright).

Compliance:
- ROBOTSTXT_OBEY=True in settings
- Low concurrency + random delay
- For internal Garage Genius training / RAG only
- Prefer official APIs where available; HTML is best-effort and may break
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

import scrapy
from scrapy_playwright.page import PageMethod

from car_qa.items import RawOwnerPostItem


def _raw_id(*parts: str) -> str:
    h = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"raw_{h}"


def _load_models(path: str) -> list[dict]:
    p = Path(path)
    if not p.is_file():
        return []
    return json.loads(p.read_text(encoding="utf-8"))


class CarOwnerQaSpider(scrapy.Spider):
    name = "car_owner_qa"

    custom_settings = {
        # Extra politeness for this spider
        "DOWNLOAD_DELAY": 4,
        "CONCURRENT_REQUESTS": 2,
    }

    def __init__(self, limit: str | None = None, sources: str = "reddit,edmunds", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.limit = int(limit) if limit else None
        self.sources = {s.strip().lower() for s in sources.split(",") if s.strip()}

    async def start(self):
        """Scrapy ≥2.13: async start() replaced start_requests()."""
        models = _load_models(self.settings.get("MODELS_CONFIG"))
        if self.limit:
            models = models[: self.limit]
        if not models:
            self.logger.error("No models in config/models.json")
            return

        for m in models:
            brand = m["brand"]
            model = m["model"]
            years = m.get("year_range", "2023-2025")
            slug = m.get("slug") or f"{brand}-{model}".lower().replace(" ", "-")
            subreddit = (m.get("subreddit") or brand).lstrip("r/")

            if "reddit" in self.sources:
                # Prefer subreddit listing JSON (search.json is Disallow'd in Reddit robots.txt)
                url = f"https://www.reddit.com/r/{subreddit}/new.json?limit=20"
                yield scrapy.Request(
                    url,
                    callback=self.parse_reddit_json,
                    headers={
                        "Accept": "application/json",
                        "User-Agent": "GarageGeniusAI/0.1 (internal RAG corpus; contact: local-dev)",
                    },
                    meta={
                        "brand": brand,
                        "model": model,
                        "year_range": years,
                    },
                    errback=self.errback_log,
                )

            if "edmunds" in self.sources:
                ed_url = f"https://www.edmunds.com/{slug}/consumer-reviews/"
                yield scrapy.Request(
                    ed_url,
                    callback=self.parse_edmunds,
                    meta={
                        "brand": brand,
                        "model": model,
                        "year_range": years,
                        "playwright": True,
                        "playwright_include_page": False,
                        "playwright_page_methods": [
                            PageMethod("wait_for_timeout", 2500),
                            PageMethod(
                                "evaluate",
                                """() => {
                                  window.scrollTo(0, document.body.scrollHeight / 2);
                                }""",
                            ),
                            PageMethod("wait_for_timeout", 1500),
                        ],
                    },
                    errback=self.errback_log,
                )

    def errback_log(self, failure):
        self.logger.warning("Request failed: %s", failure)

    def parse_reddit_json(self, response):
        brand = response.meta["brand"]
        model = response.meta["model"]
        years = response.meta["year_range"]
        if response.status != 200:
            self.logger.warning("Reddit HTTP %s for %s %s", response.status, brand, model)
            return
        try:
            payload = json.loads(response.text)
        except json.JSONDecodeError:
            self.logger.warning("Reddit non-JSON for %s %s", brand, model)
            return

        # Listing endpoint: {data:{children:[...]}}  OR search-shaped
        children = (
            payload.get("data", {}).get("children", [])
            if isinstance(payload, dict)
            else []
        )
        model_tokens = {t.lower() for t in model.replace("-", " ").split() if len(t) > 1}
        brand_l = brand.lower()

        for child in children:
            data = child.get("data") or {}
            title = (data.get("title") or "").strip()
            body = (data.get("selftext") or "").strip()
            permalink = data.get("permalink") or ""
            url = urljoin("https://www.reddit.com", permalink) if permalink else data.get("url")
            score = data.get("score") or 0
            if not title:
                continue
            blob = f"{title}\n{body}".lower()
            # Keep threads that mention the model or look like ownership/problems
            mentions_model = any(tok in blob for tok in model_tokens) or brand_l in blob
            looks_useful = any(
                k in blob
                for k in (
                    "owner",
                    "problem",
                    "issue",
                    "mpg",
                    "fuel",
                    "reliability",
                    "repair",
                    "noise",
                    "transmission",
                    "battery",
                    "hybrid",
                )
            )
            if not (mentions_model or looks_useful):
                continue
            if len(title) < 12 and len(body) < 40:
                continue

            yield RawOwnerPostItem(
                source="Reddit",
                source_url=url or response.url,
                brand=brand,
                model=model,
                year_range=years,
                title=title,
                body=body[:4000],
                comments=[],
                score=score,
                scraped_at=datetime.now(timezone.utc).isoformat(),
                raw_id=_raw_id("reddit", brand, model, title, body[:200]),
            )

            if permalink and score and int(score) >= 3:
                comments_url = urljoin(
                    "https://www.reddit.com", permalink.rstrip("/") + ".json"
                )
                yield scrapy.Request(
                    comments_url,
                    callback=self.parse_reddit_comments,
                    headers={
                        "Accept": "application/json",
                        "User-Agent": "GarageGeniusAI/0.1 (internal RAG corpus; contact: local-dev)",
                    },
                    meta={
                        "brand": brand,
                        "model": model,
                        "year_range": years,
                        "title": title,
                        "body": body[:2000],
                        "source_url": url,
                        "score": score,
                    },
                    errback=self.errback_log,
                )

    def parse_reddit_comments(self, response):
        brand = response.meta["brand"]
        model = response.meta["model"]
        years = response.meta["year_range"]
        try:
            payload = json.loads(response.text)
        except json.JSONDecodeError:
            return
        if not isinstance(payload, list) or len(payload) < 2:
            return
        comments = []
        for child in payload[1].get("data", {}).get("children", [])[:12]:
            cdata = child.get("data") or {}
            body = (cdata.get("body") or "").strip()
            if body and body not in ("[deleted]", "[removed]"):
                comments.append(body[:800])
        if not comments:
            return
        title = response.meta["title"]
        yield RawOwnerPostItem(
            source="Reddit",
            source_url=response.meta.get("source_url") or response.url,
            brand=brand,
            model=model,
            year_range=years,
            title=title,
            body=response.meta.get("body") or "",
            comments=comments,
            score=response.meta.get("score") or 0,
            scraped_at=datetime.now(timezone.utc).isoformat(),
            raw_id=_raw_id("reddit_c", brand, model, title, "|".join(comments[:3])),
        )

    def parse_edmunds(self, response):
        brand = response.meta["brand"]
        model = response.meta["model"]
        years = response.meta["year_range"]

        # Best-effort selectors — Edmunds markup changes; LLM cleans noisy text
        cards = response.css("[data-tracking-id='consumer-review'], .review-item, article")
        if not cards:
            # Fallback: grab review-like paragraphs
            blobs = response.css("p::text").getall()
            text = " ".join(t.strip() for t in blobs if t and len(t.strip()) > 40)[:5000]
            if len(text) > 200:
                yield RawOwnerPostItem(
                    source="Edmunds",
                    source_url=response.url,
                    brand=brand,
                    model=model,
                    year_range=years,
                    title=f"{brand} {model} owner reviews page",
                    body=text,
                    comments=[],
                    score=0,
                    scraped_at=datetime.now(timezone.utc).isoformat(),
                    raw_id=_raw_id("edmunds_page", brand, model, response.url),
                )
            return

        for card in cards[:20]:
            title = (
                card.css("h3::text, h2::text, .review-title::text").get()
                or card.css("::attr(aria-label)").get()
                or ""
            ).strip()
            paras = card.css("p::text").getall()
            body = " ".join(p.strip() for p in paras if p.strip())
            if len(body) < 80 and not title:
                continue
            yield RawOwnerPostItem(
                source="Edmunds",
                source_url=response.url,
                brand=brand,
                model=model,
                year_range=years,
                title=title or f"{brand} {model} consumer review",
                body=body[:4000],
                comments=[],
                score=0,
                scraped_at=datetime.now(timezone.utc).isoformat(),
                raw_id=_raw_id("edmunds", brand, model, title, body[:180]),
            )
