"""Scrapy items for raw forum/review harvest (pre-LLM)."""

import scrapy


class RawOwnerPostItem(scrapy.Item):
    """Unstructured scrape payload — LLM cleaner turns this into owner-reviews JSONL."""

    source = scrapy.Field()
    source_url = scrapy.Field()
    brand = scrapy.Field()
    model = scrapy.Field()
    year_range = scrapy.Field()
    title = scrapy.Field()
    body = scrapy.Field()
    comments = scrapy.Field()  # list[str]
    score = scrapy.Field()
    scraped_at = scrapy.Field()
    raw_id = scrapy.Field()  # stable hash for dedupe of raw corpus
