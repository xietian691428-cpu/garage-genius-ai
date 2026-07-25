"""Scrapy settings — anti-ban defaults for Playwright + optional proxy pool."""

from pathlib import Path

BOT_NAME = "car_qa"
SPIDER_MODULES = ["car_qa.spiders"]
NEWSPIDER_MODULE = "car_qa.spiders"

# Compliance / politeness
ROBOTSTXT_OBEY = True
COOKIES_ENABLED = True
TELNETCONSOLE_ENABLED = False
LOG_LEVEL = "INFO"

# Rate limits (override via env or -s)
DOWNLOAD_DELAY = 3
RANDOMIZE_DOWNLOAD_DELAY = True
CONCURRENT_REQUESTS = 2
CONCURRENT_REQUESTS_PER_DOMAIN = 1
RETRY_TIMES = 2
DOWNLOAD_TIMEOUT = 60

DEFAULT_REQUEST_HEADERS = {
    "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Playwright
DOWNLOAD_HANDLERS = {
    "http": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
    "https": "scrapy_playwright.handler.ScrapyPlaywrightDownloadHandler",
}
TWISTED_REACTOR = "twisted.internet.asyncioreactor.AsyncioSelectorReactor"
PLAYWRIGHT_BROWSER_TYPE = "chromium"
PLAYWRIGHT_LAUNCH_OPTIONS = {
    "headless": True,
    "args": [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
    ],
}
PLAYWRIGHT_DEFAULT_NAVIGATION_TIMEOUT = 45_000
PLAYWRIGHT_ABORT_REQUEST = None  # set in middleware if needed

# Middlewares
DOWNLOADER_MIDDLEWARES = {
    "car_qa.middlewares.ProxyPoolMiddleware": 350,
    "car_qa.middlewares.RandomUserAgentMiddleware": 400,
    "scrapy.downloadermiddlewares.useragent.UserAgentMiddleware": None,
}

ITEM_PIPELINES = {
    "car_qa.pipelines.RawJsonlPipeline": 300,
    "car_qa.pipelines.LlmCleanPipeline": 400,
}

# Paths (relative to scrapy.cfg dir)
_ROOT = Path(__file__).resolve().parents[1]
MODELS_CONFIG = str(_ROOT / "config" / "models.json")
PROXIES_FILE = str(_ROOT / "config" / "proxies.txt")
RAW_OUTPUT = str(_ROOT / "output" / "raw_posts.jsonl")
# Final structured Q&A (append into repo corpus)
OWNER_REVIEWS_JSONL = str(
    _ROOT.parents[1] / "data" / "owner-reviews.jsonl"
)

# LLM (env overrides preferred)
LLM_ENABLED = False  # set True or -s LLM_ENABLED=True after scrape, or run tools/llm_clean_to_jsonl.py
LLM_PROVIDER = "openai"  # openai | grok | ollama
LLM_MODEL = "gpt-4o-mini"
LLM_BATCH_SIZE = 4
LLM_MAX_ITEMS_PER_RUN = 40

FEED_EXPORT_ENCODING = "utf-8"
REQUEST_FINGERPRINTER_IMPLEMENTATION = "2.7"
