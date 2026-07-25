"""Shared helpers for public-source harvesters (CarComplaints / repair cost / ratings / SERP)."""

from __future__ import annotations

import hashlib
import json
import random
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.robotparser import RobotFileParser

import httpx

ROOT = Path(__file__).resolve().parents[1]
MODELS_CFG = ROOT / "config" / "models_public.json"
RAW_OUT = ROOT / "output" / "raw_posts.jsonl"

UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/126.0.0.0 Safari/537.36"
)
RESEARCH_UA = "GarageGeniusAI-Research/0.1 (internal RAG; polite; contact: local-dev)"


def raw_id(prefix: str, *parts: str) -> str:
    h = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}_{h}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_models() -> list[dict]:
    return json.loads(MODELS_CFG.read_text(encoding="utf-8"))


def filter_models(models: list[dict], models_arg: str | None) -> list[dict]:
    if not models_arg:
        return models
    wanted = {s.strip().lower() for s in models_arg.split(",") if s.strip()}
    out: list[dict] = []
    for m in models:
        keys = {
            m["model"].lower(),
            m["model"].lower().replace(" ", "-"),
            m["model"].lower().replace(" ", "_"),
            m["brand"].lower(),
        }
        if wanted & keys:
            out.append(m)
    return out


def load_existing_raw_ids(path: Path = RAW_OUT) -> set[str]:
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


def write_item(fh, seen: set[str], item: dict) -> bool:
    rid = item.get("raw_id")
    if not rid or rid in seen:
        return False
    seen.add(rid)
    fh.write(json.dumps(item, ensure_ascii=False) + "\n")
    return True


def years_from_range(year_range: str) -> list[int]:
    m = re.match(r"(\d{4})\s*-\s*(\d{4})", year_range or "")
    if not m:
        return [2019, 2020, 2021, 2022, 2023, 2024, 2025]
    return list(range(int(m.group(1)), int(m.group(2)) + 1))


def polite_sleep(lo: float = 1.2, hi: float = 2.8) -> None:
    time.sleep(random.uniform(lo, hi))


def http_client() -> httpx.Client:
    return httpx.Client(
        trust_env=False,
        timeout=40.0,
        follow_redirects=True,
        headers={
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        },
    )


def robots_allows(robots_url: str, path_url: str, client: httpx.Client) -> tuple[bool, str]:
    try:
        r = client.get(robots_url, headers={"User-Agent": RESEARCH_UA})
        body = r.text or ""
        if r.status_code != 200 or "<html" in body[:200].lower():
            return True, f"robots unread ({r.status_code}); proceed cautiously"
        rp = RobotFileParser()
        rp.parse(body.splitlines())
        ok = rp.can_fetch(RESEARCH_UA, path_url) and rp.can_fetch("*", path_url)
        return ok, "allowed" if ok else "disallowed by robots.txt"
    except Exception as e:
        return True, f"robots check failed ({type(e).__name__}); proceed cautiously"


def strip_html(html: str) -> str:
    html = re.sub(r"<script[^>]*>.*?</script>", " ", html, flags=re.S | re.I)
    html = re.sub(r"<style[^>]*>.*?</style>", " ", html, flags=re.S | re.I)
    text = re.sub(r"<[^>]+>", " ", html)
    return re.sub(r"\s+", " ", text).strip()


def meta_content(html: str, name: str) -> str:
    m = re.search(
        rf'(?:name|property)="{re.escape(name)}"\s+content="([^"]+)"',
        html,
        re.I,
    )
    if not m:
        m = re.search(
            rf'content="([^"]+)"\s+(?:name|property)="{re.escape(name)}"',
            html,
            re.I,
        )
    return (m.group(1).strip() if m else "")


def make_raw(
    *,
    source: str,
    source_url: str,
    brand: str,
    model: str,
    year_range: str,
    title: str,
    body: str,
    prefix: str,
    score: int = 0,
    metadata: dict[str, Any] | None = None,
) -> dict | None:
    body = (body or "").strip()
    title = (title or "").strip()
    if len(body) < 60 and len(title) < 20:
        return None
    return {
        "source": source,
        "source_url": source_url,
        "brand": brand,
        "model": model,
        "year_range": year_range,
        "title": title or f"{brand} {model}",
        "body": body[:4500],
        "comments": [],
        "score": score,
        "scraped_at": now_iso(),
        "raw_id": raw_id(prefix, brand, model, title, body[:160], source_url),
        "metadata": metadata or {},
    }
