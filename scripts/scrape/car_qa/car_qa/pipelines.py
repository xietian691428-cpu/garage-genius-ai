"""Pipelines: write raw JSONL; optionally LLM-clean into owner-reviews.jsonl (Scrapy 2.17+)."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from itemadapter import ItemAdapter

from car_qa.llm_clean import llm_clean_batch

logger = logging.getLogger(__name__)


def _ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def load_existing_ids(path: Path) -> set[str]:
    ids: set[str] = set()
    if not path.is_file():
        return ids
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            ids.add(json.loads(line).get("id", ""))
        except json.JSONDecodeError:
            continue
    ids.discard("")
    return ids


class RawJsonlPipeline:
    def __init__(self, crawler):
        self.crawler = crawler
        path = Path(crawler.settings.get("RAW_OUTPUT"))
        _ensure_parent(path)
        self.path = path
        self.seen: set[str] = set()
        self.fh = None
        self.buffer: list[dict] = []

    @classmethod
    def from_crawler(cls, crawler):
        return cls(crawler)

    def open_spider(self):
        path = self.path
        if path.is_file():
            for line in path.read_text(encoding="utf-8").splitlines():
                try:
                    rid = json.loads(line).get("raw_id")
                    if rid:
                        self.seen.add(rid)
                except json.JSONDecodeError:
                    pass
        self.fh = path.open("a", encoding="utf-8")
        logger.info("Raw JSONL → %s (existing keys=%d)", path, len(self.seen))

    def close_spider(self):
        if self.fh:
            self.fh.close()

    def process_item(self, item):
        ad = ItemAdapter(item)
        rid = ad.get("raw_id")
        if rid and rid in self.seen:
            logger.debug("Skip duplicate raw_id=%s", rid)
            return item
        if rid:
            self.seen.add(rid)
        row = dict(ad)
        if not row.get("scraped_at"):
            row["scraped_at"] = datetime.now(timezone.utc).isoformat()
        assert self.fh is not None
        self.fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        self.fh.flush()
        self.buffer.append(row)
        self.crawler.stats.set_value("raw_buffer_size", len(self.buffer))
        return item


class LlmCleanPipeline:
    def __init__(self, crawler):
        self.crawler = crawler
        settings = crawler.settings
        self.enabled = bool(settings.getbool("LLM_ENABLED", False))
        self.provider = settings.get("LLM_PROVIDER", "openai")
        self.model = settings.get("LLM_MODEL")
        self.batch_size = int(settings.getint("LLM_BATCH_SIZE", 4))
        self.max_items = int(settings.getint("LLM_MAX_ITEMS_PER_RUN", 40))
        self.out = Path(settings.get("OWNER_REVIEWS_JSONL"))
        self.existing_ids: set[str] = set()
        self.queue: list[dict] = []
        self.written = 0

    @classmethod
    def from_crawler(cls, crawler):
        return cls(crawler)

    def open_spider(self):
        _ensure_parent(self.out)
        self.existing_ids = load_existing_ids(self.out)
        if self.enabled:
            logger.info("LLM clean ON → %s (provider=%s)", self.out, self.provider)
        else:
            logger.info("LLM clean OFF (use tools/llm_clean_to_jsonl.py)")

    def close_spider(self):
        if self.enabled and self.queue:
            self._flush()

    def process_item(self, item):
        if not self.enabled:
            return item
        if self.written >= self.max_items:
            return item
        self.queue.append(dict(ItemAdapter(item)))
        if len(self.queue) >= self.batch_size:
            self._flush()
        return item

    def _flush(self):
        batch = self.queue[: self.batch_size]
        self.queue = self.queue[self.batch_size :]
        try:
            rows = llm_clean_batch(
                batch, provider=self.provider, model=self.model
            )
        except Exception as exc:
            logger.error("LLM batch failed: %s", exc)
            return
        with self.out.open("a", encoding="utf-8") as fh:
            for row in rows:
                rid = row.get("id")
                if not rid or rid in self.existing_ids:
                    continue
                self.existing_ids.add(rid)
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                self.written += 1
                logger.info("Appended Q&A id=%s", rid)
