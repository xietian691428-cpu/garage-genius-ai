#!/usr/bin/env python3
"""
Offline LLM cleaner: raw_posts.jsonl → append English Q&A to owner-reviews.jsonl

Usage (from scripts/scrape/car_qa):
  ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=10
  ./run.sh clean --model=deepseek-chat --limit=10   # auto-routes to DeepSeek
  python tools/llm_clean_to_jsonl.py --provider=grok --model=grok-2-latest --limit=30
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from tqdm import tqdm

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from car_qa.llm_clean import llm_clean_batch, resolve_provider_and_model  # noqa: E402
from car_qa.pipelines import load_existing_ids  # noqa: E402


def main() -> int:
    # Load repo .env.local if present
    repo = ROOT.parents[2]
    load_dotenv(repo / ".env.local")
    load_dotenv(ROOT / ".env")

    ap = argparse.ArgumentParser(description="LLM-clean raw posts → owner-reviews.jsonl")
    ap.add_argument("--raw", default=str(ROOT / "output" / "raw_posts.jsonl"))
    ap.add_argument(
        "--out",
        default=str(ROOT.parents[1] / "data" / "owner-reviews.jsonl"),
    )
    ap.add_argument(
        "--provider",
        default=None,
        choices=["openai", "deepseek", "grok", "ollama"],
        help="Default: deepseek if DEEPSEEK_API_KEY set, else openai",
    )
    ap.add_argument("--model", default=None)
    ap.add_argument("--batch-size", type=int, default=4)
    ap.add_argument("--limit", type=int, default=80)
    ap.add_argument(
        "--offset",
        type=int,
        default=0,
        help="Skip first N raw posts (continue after a previous clean batch)",
    )
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    provider = args.provider
    if not provider:
        provider = "deepseek" if os.getenv("DEEPSEEK_API_KEY") else "openai"
    provider, model = resolve_provider_and_model(provider, args.model)
    print(f"LLM provider={provider} model={model}")

    raw_path = Path(args.raw)
    out_path = Path(args.out)
    if not raw_path.is_file():
        print(f"No raw file: {raw_path}")
        return 1

    posts = []
    for line in raw_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            posts.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    offset = max(0, args.offset)
    if offset:
        posts = posts[offset:]
        print(f"Offset {offset} → {len(posts)} remaining raw posts")
    if args.limit:
        posts = posts[: args.limit]

    existing = load_existing_ids(out_path)
    print(f"Raw posts: {len(posts)} | existing Q&A ids: {len(existing)}")

    written = 0
    batch_size = max(1, args.batch_size)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    failed = 0

    for i in tqdm(range(0, len(posts), batch_size), desc="LLM clean"):
        batch = posts[i : i + batch_size]
        try:
            rows = llm_clean_batch(batch, provider=provider, model=model)
        except Exception as exc:
            failed += 1
            err = str(exc)
            print(f"Batch failed: {err}")
            if "NotFoundError" in type(exc).__name__ or "404" in err:
                print(
                    "Hint: deepseek-chat must use --provider=deepseek "
                    "(not openai). Example:\n"
                    "  ./run.sh clean --provider=deepseek --model=deepseek-chat --limit=10"
                )
            continue
        if args.dry_run:
            print(json.dumps(rows, indent=2, ensure_ascii=False)[:2000])
            continue
        with out_path.open("a", encoding="utf-8") as fh:
            for row in rows:
                rid = row.get("id")
                if not rid or rid in existing:
                    continue
                existing.add(rid)
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                written += 1

    print(
        f"Appended {written} Q&A → {out_path}"
        + (f" (batches failed: {failed})" if failed else "")
    )
    print("Next: npm run seed:owner-reviews:text")
    return 1 if failed and written == 0 else 0


if __name__ == "__main__":
    raise SystemExit(main())
