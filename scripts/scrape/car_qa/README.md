# Garage Genius AI — Owner Q&A scraper (Scrapy + Playwright + LLM)

Internal corpus builder for `scripts/data/owner-reviews.jsonl`.  
**Not for production scraping-as-a-service.** Respect `robots.txt`, site Terms, and rate limits. Use only for internal AI / RAG training.

## What it does

1. **Crawl** popular US models (config in `config/models.json`)
   - Reddit: public `.json` search + comment threads (no Playwright)
   - Edmunds: Playwright for consumer-review pages
2. Write **raw** posts → `output/raw_posts.jsonl` (dedupe by `raw_id`)
3. **LLM clean** (OpenAI / Grok / Ollama) → English structured Q&A
4. **Append** to `scripts/data/owner-reviews.jsonl` (skip duplicate `id`)
5. Seed DB: `npm run seed:owner-reviews:text` (skips already-seeded ingest_keys; use `:text:force` only to rewrite)

## Install

```bash
cd scripts/scrape/car_qa
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
cp config/proxies.example.txt config/proxies.txt   # fill proxies
```

## Env (repo `.env.local` or local `.env`)

```bash
# OpenAI-compatible
OPENAI_API_KEY=
# or DeepSeek
# DEEPSEEK_API_KEY=
# OPENAI_BASE_URL=https://api.deepseek.com

# Grok (xAI)
# XAI_API_KEY=
# LLM via: --provider=grok --model=grok-2-latest

# Ollama local
# OLLAMA_BASE_URL=http://127.0.0.1:11434/v1

# Optional comma-separated proxies
# PROXY_LIST=http://user:pass@host:port
```

## Run crawl

```bash
cd scripts/scrape/car_qa
source .venv/bin/activate

# Smoke test: 2 models, Reddit only
scrapy crawl car_owner_qa -a limit=2 -a sources=reddit

# Full models, Reddit + Edmunds
scrapy crawl car_owner_qa -a sources=reddit,edmunds

# Online LLM during crawl (slower; usually prefer offline step)
scrapy crawl car_owner_qa -a limit=3 -s LLM_ENABLED=True -s LLM_PROVIDER=openai
```

## LLM clean → append JSONL

```bash
python tools/llm_clean_to_jsonl.py --provider=openai --limit=40
# or
python tools/llm_clean_to_jsonl.py --provider=grok --model=grok-2-latest --limit=40
python tools/dedupe_jsonl.py ../../data/owner-reviews.jsonl
```

Then from repo root (incremental — only inserts rows not already in DB):

```bash
npm run seed:owner-reviews:text
```

## Anti-ban checklist

| Control | Where |
| --- | --- |
| Proxy pool | `config/proxies.txt` or `PROXY_LIST` |
| Random delay | `DOWNLOAD_DELAY` + `RANDOMIZE_DOWNLOAD_DELAY` |
| Low concurrency | `CONCURRENT_REQUESTS=2` |
| robots.txt | `ROBOTSTXT_OBEY=True` |
| Browser fingerprint | Playwright Chromium + rotating UA |

## Output schema (after LLM)

Same as `scripts/data/README-owner-reviews.md`:

`id`, `brand`, `model`, `year_range`, `category`, `question`, `answer`, `source`, `source_url`, `date`, `upvotes`, `sentiment`, `keywords`, `market`, `language`

Questions/answers are **always English**.

## Notes

- **Reddit** currently publishes `User-agent: * / Disallow: /` — Scrapy with `ROBOTSTXT_OBEY=True` will not crawl it. Prefer the **official Reddit API** (OAuth) for production harvests, or use `tools/run_demo_pipeline.py` to validate the LLM→JSONL path. **Do Reddit after Edmunds is working.**
- Edmunds may block datacenter IPs (403) — prefer **`EDMUNDS_API_KEY`** (official Vehicle Reviews API v2); else residential proxies + Playwright. See `./run.sh edmunds --probe`.
- Edmunds DOM changes often — Playwright intercepts gateway JSON when possible; LLM extracts Q&A.
- Do not scrape behind logins or paywalls.

### Edmunds (priority owner-review batch)

Structured consumer reviews (ratings + long text): real-world MPG, comfort, maintenance cost, dealer service.

**Compliance (keep this US-law-aware):**
- Prefer **`EDMUNDS_API_KEY`** (licensed API) whenever possible.
- HTML/Playwright path: public consumer-review pages only; no login/CAPTCHA/paywall bypass.
- Obey `robots.txt` when readable (harvester aborts on explicit Disallow).
- Polite rate limits (default 4–9s between year pages, concurrency 1).
- Internal RAG / training only — do not republish full review text.
- Site Terms may still restrict scraping even when criminal CFAA risk is low; treat HTML harvest as a small temporary fallback.

```bash
# Connectivity / auth check
./run.sh edmunds --probe

# Offline parser smoke (no network)
./run.sh edmunds --from-fixture

# Fallback without API: US residential proxies in config/proxies.txt
./run.sh edmunds --method=playwright --models=rav4 --per-model=50 --proxy
# Full focus list:
./run.sh edmunds --per-model=200 --proxy
./run.sh clean --provider=deepseek --limit=200
```

Config: `config/models_edmunds.json` — RAV4, F-150, CR-V, Silverado, Telluride, Ram 1500, Forester, Wrangler, Model Y, X5, GLE.  
Keyword bias: owner review / real world mpg / maintenance cost / long term / problems / reliability.
Proxies: `config/proxies.txt` (see `proxies.example.txt`). Stealth: `playwright-stealth` if installed, else init-script fallback.

### Public sources (no residential proxy)

When Edmunds API/proxy is unavailable, harvest these in parallel:

| Source | Command piece | Notes |
| --- | --- | --- |
| CarComplaints | `carcomplaints` | Structured owner fault reports (works from datacenter IP) |
| Repair cost | `repaircost` | RepairPal if reachable; else **YourMechanic** public estimates |
| Ratings | `ratings` | CR public teasers only + IIHS (J.D. Power often 403) |
| Reddit via SERP | `serp` | DuckDuckGo `site:reddit.com …` snippets (not Google HTML; no Reddit crawl) |

```bash
./run.sh public --smoke
./run.sh public --models=rav4,f-150,cr-v
./run.sh public --sources=carcomplaints,repaircost,ratings,serp
./run.sh clean --provider=deepseek --limit=200
```

Config: `config/models_public.json`.

## Batch sources

| Command | Source | Notes |
| --- | --- | --- |
| `./run.sh nhtsa` | NHTSA complaints | Owner complaint narratives |
| `./run.sh batch2` | NHTSA recalls + EPA MPG | Official recalls + lab fuel economy |
| `./run.sh batch3` | Safety ratings + 20 new models | Ratings for all models; complaints/recalls/EPA for new models |
| `./run.sh batch4` | +20 models | Luxury / crossover expansion |
| `./run.sh group1` | **US Group-1 deep** | RAV4/Camry/Corolla/Tacoma, F-150/Explorer/Escape, CR-V/Civic/Accord/Pilot, Silverado/Equinox/Tahoe — years **2018–2025**, up to **80 diversified complaints/year**, plus recalls + safety + EPA |

### Group-1 strategy (US volume leaders)

Reddit/Edmunds HTML remain blocked (robots / 403). Prefer these public APIs.

Deep harvest goals (per model):
- **Raw:** ~300–800 rows (complaints diversified by component: engine / brakes / electrical / …)
- **After LLM clean:** ~200–400 high-quality English Q&A + maintenance-oriented answers

```bash
# First full run (optional wipe):
./run.sh group1 --replace-raw --per-year=80
# Append / resume / single model (does NOT wipe):
./run.sh group1 --per-year=80
./run.sh group1 --only-model=F-150 --sources=complaints --per-year=50
# chunked clean (resume with --offset):
./run.sh clean --provider=deepseek --model=deepseek-chat --offset=0 --limit=150
npm run seed:owner-reviews:text
```

Config: `config/models_group1.json` (next: Group 2 / Group 3 configs).

### Group-2 strategy

```bash
# Append Group-2 onto existing raw (recommended):
./run.sh group2 --per-year=80
./run.sh group2 --only-model="Model Y" --sources=complaints --per-year=80
# Tesla EV keyword bias is built-in (battery degradation / charging / software update).
```

Config: `config/models_group2.json` — Telluride, Ram 1500, Forester/Outback, Wrangler/Grand Cherokee, Model Y, Tucson/Santa Fe, CX-5.

### Merge / validate after clean

```bash
./run.sh merge
./run.sh merge --write-deduped
# Optional coach schedule boost (already shippable):
#   scripts/data/maintenance-coach-schedules.jsonl
```

Coach smoke prompts: `fixtures/coach-smoke-prompts.md` (RAV4 / F-150 / Telluride / Model Y).

### Group-3 strategy (luxury / premium)

```bash
# Pilot (recommended first):
./run.sh group3 --smoke --per-year=80
# Full Group-3:
./run.sh group3 --per-year=80
./run.sh group3 --only-model="X5"
./run.sh group3 --only-model="GLE"
```

Config: `config/models_group3.json` — X5, GLE, Tucson/Santa Fe, Q5, RX, MDX, XC90, Cayenne, GV80.  
Luxury models bias toward: common issues / maintenance cost / long-term reliability.
