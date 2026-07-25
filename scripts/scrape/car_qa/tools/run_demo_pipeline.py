#!/usr/bin/env python3
"""
Load demo raw posts → output/raw_posts.jsonl, then optionally LLM-clean.

Used when sites disallow crawlers via robots.txt (e.g. Reddit Disallow: /).

  python tools/run_demo_pipeline.py
  python tools/run_demo_pipeline.py --clean --provider=openai --limit=10
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FIXTURE = ROOT / "fixtures" / "demo_raw_posts.json"
RAW_OUT = ROOT / "output" / "raw_posts.jsonl"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--clean", action="store_true", help="Also run LLM cleaner")
    ap.add_argument("--provider", default="openai")
    ap.add_argument("--model", default=None)
    ap.add_argument("--limit", type=int, default=20)
    ap.add_argument("--append", action="store_true", help="Append instead of replace raw file")
    args = ap.parse_args()

    posts = json.loads(FIXTURE.read_text(encoding="utf-8"))
    RAW_OUT.parent.mkdir(parents=True, exist_ok=True)
    mode = "a" if args.append else "w"
    with RAW_OUT.open(mode, encoding="utf-8") as fh:
        for p in posts:
            fh.write(json.dumps(p, ensure_ascii=False) + "\n")
    print(f"Wrote {len(posts)} demo raw posts → {RAW_OUT}")

    if not args.clean:
        print("Next: python tools/llm_clean_to_jsonl.py --limit=10")
        return 0

    cmd = [
        sys.executable,
        str(ROOT / "tools" / "llm_clean_to_jsonl.py"),
        f"--provider={args.provider}",
        f"--limit={args.limit}",
    ]
    if args.model:
        cmd.append(f"--model={args.model}")
    return subprocess.call(cmd, cwd=str(ROOT))


if __name__ == "__main__":
    raise SystemExit(main())
