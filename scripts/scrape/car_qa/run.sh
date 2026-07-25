#!/usr/bin/env bash
# Quick helpers for owner Q&A scrape → LLM → seed
set -euo pipefail
cd "$(dirname "$0")"

cmd="${1:-help}"
shift || true

case "$cmd" in
  install)
    python3 -m venv .venv
    # shellcheck disable=SC1091
    source .venv/bin/activate
    pip install -r requirements.txt
    playwright install chromium
    [[ -f config/proxies.txt ]] || cp config/proxies.example.txt config/proxies.txt
    echo "OK — edit config/proxies.txt and set API keys in repo .env.local"
    ;;
  crawl)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    scrapy crawl car_owner_qa "$@"
    ;;
  clean)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    python tools/llm_clean_to_jsonl.py "$@"
    ;;
  demo)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    python tools/run_demo_pipeline.py "$@"
    ;;
  nhtsa)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    python tools/harvest_nhtsa.py "$@"
    ;;
  batch2)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    python tools/harvest_batch2.py --replace-raw "$@"
    ;;
  batch3)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    python tools/harvest_batch3.py --replace-raw "$@"
    ;;
  batch4)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    python tools/harvest_batch4.py --replace-raw "$@"
    ;;
  group1)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    # Deep US Group-1 harvest (2018–2025, high complaint caps).
    # Pass --replace-raw to wipe raw_posts.jsonl; omit to append (e.g. --only-model=F-150).
    python tools/harvest_group1_deep.py "$@"
    ;;
  group2)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    # Deep US Group-2 harvest (Telluride/Ram/Subaru/Jeep/Tesla Y/…).
    # Default appends to raw_posts.jsonl — do NOT pass --replace-raw unless wiping intentionally.
    python tools/harvest_group2_deep.py "$@"
    ;;
  group3)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    # Group-3 luxury / premium SUVs. Default append.
    # Pilot: ./run.sh group3 --smoke --per-year=80
    # Full:  ./run.sh group3 --per-year=80
    python tools/harvest_group3_deep.py "$@"
    ;;
  edmunds)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    # Edmunds consumer reviews (API key preferred; Playwright + US residential proxy fallback).
    # Examples:
    #   ./run.sh edmunds --probe
    #   ./run.sh edmunds --from-fixture
    #   ./run.sh edmunds --method=playwright --models=rav4 --per-model=50 --proxy
    #   ./run.sh edmunds --models="rav4,f-150,cr-v" --per-model=150 --proxy
    python tools/harvest_edmunds.py "$@"
    ;;
  public)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    # Parallel public sources (no residential proxy required):
    #   carcomplaints, repaircost (RepairPal→YourMechanic), ratings (CR/IIHS), serp (DDG→Reddit snippets)
    # Examples:
    #   ./run.sh public --smoke
    #   ./run.sh public --models=rav4,f-150,cr-v
    #   ./run.sh public --sources=carcomplaints,repaircost --parallel
    python tools/harvest_public_batch.py "$@"
    ;;
  merge)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    # Validate owner-reviews.jsonl: counts, dedupe, category mix, priority models.
    # Pass --write-deduped to rewrite unique ids only.
    # Pass --stats for ASCII category table / pie summary.
    python tools/merge_validate_jsonl.py ../../data/owner-reviews.jsonl "$@"
    ;;
  expand-maint)
    # shellcheck disable=SC1091
    source .venv/bin/activate
    python tools/expand_maintenance_variants.py "$@"
    ;;
  seed)
    (cd ../../.. && npm run seed:owner-reviews:text)
    ;;
  *)
    cat <<'EOF'
Usage:
  ./run.sh install
  ./run.sh nhtsa                 # batch1: NHTSA complaints
  ./run.sh batch2                # batch2: NHTSA recalls + EPA MPG
  ./run.sh batch3                # batch3: safety ratings + 20 new models
  ./run.sh batch4                # batch4: 20 more models
  ./run.sh group1                # US Group-1 deep harvest
  ./run.sh group2                # US Group-2 deep harvest
  ./run.sh group3                # US Group-3 luxury / premium (X5/GLE/…)
  ./run.sh group3 --smoke        # pilot: X5 + GLE + Tucson only
  ./run.sh edmunds --probe       # Edmunds connectivity (API key / proxies)
  ./run.sh edmunds --from-fixture
  ./run.sh edmunds --method=playwright --models=rav4 --per-model=50 --proxy
  ./run.sh edmunds --models="rav4,f-150,cr-v" --per-model=150 --proxy
  ./run.sh public --smoke        # CarComplaints + repair cost + CR/IIHS + SERP (RAV4)
  ./run.sh public --models=rav4,f-150,cr-v
  ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=80
  ./run.sh merge                 # validate Q&A counts / dedupe / categories
  ./run.sh merge --stats         # + ASCII category bars / pie summary
  ./run.sh merge --write-deduped
  ./run.sh expand-maint          # mileage question variants → owner-reviews
  ./run.sh demo
  ./run.sh crawl -a limit=2 -a sources=edmunds
  ./run.sh seed
EOF
    ;;
esac
