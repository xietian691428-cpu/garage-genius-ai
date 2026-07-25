"""Downloader middlewares: proxy pool + rotating desktop UA (Scrapy 2.17+)."""

from __future__ import annotations

import logging
import os
import random
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
]


def _load_proxies(path: str) -> list[str]:
    p = Path(path)
    if not p.is_file():
        return []
    out: list[str] = []
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        out.append(line)
    return out


def _playwright_proxy(proxy_url: str) -> dict:
    parsed = urlparse(proxy_url)
    if not parsed.scheme or not parsed.hostname:
        return {"server": proxy_url}
    port = f":{parsed.port}" if parsed.port else ""
    server = f"{parsed.scheme}://{parsed.hostname}{port}"
    cfg: dict = {"server": server}
    if parsed.username:
        cfg["username"] = parsed.username
    if parsed.password:
        cfg["password"] = parsed.password
    return cfg


class ProxyPoolMiddleware:
    def __init__(self, proxies: list[str]):
        self.proxies = proxies
        if proxies:
            logger.info("Proxy pool loaded: %d proxies", len(proxies))
        else:
            logger.warning(
                "No proxies configured — set config/proxies.txt or PROXY_LIST. "
                "Crawling without proxies increases ban risk."
            )

    @classmethod
    def from_crawler(cls, crawler):
        path = crawler.settings.get("PROXIES_FILE", "")
        proxies = _load_proxies(path) if path else []
        env_list = os.getenv("PROXY_LIST", "").strip()
        if env_list:
            proxies.extend(
                [x.strip() for x in env_list.split(",") if x.strip()]
            )
        return cls(proxies)

    def process_request(self, request):
        if not self.proxies:
            return None
        proxy = random.choice(self.proxies)
        request.meta["proxy"] = proxy
        if request.meta.get("playwright"):
            ctx = dict(request.meta.get("playwright_context_kwargs") or {})
            ctx["proxy"] = _playwright_proxy(proxy)
            request.meta["playwright_context_kwargs"] = ctx
        return None


class RandomUserAgentMiddleware:
    def process_request(self, request):
        request.headers["User-Agent"] = random.choice(USER_AGENTS)
        return None
