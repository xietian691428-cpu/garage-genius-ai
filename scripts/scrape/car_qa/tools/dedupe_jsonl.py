#!/usr/bin/env python3
"""
Dedupe / merge helper for owner-reviews.jsonl (keeps first occurrence of each id).

  python tools/dedupe_jsonl.py ../../data/owner-reviews.jsonl
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--inplace", action="store_true", default=True)
    args = ap.parse_args()
    path = Path(args.path)
    seen: set[str] = set()
    out: list[str] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            rid = json.loads(line).get("id")
        except json.JSONDecodeError:
            continue
        if not rid or rid in seen:
            continue
        seen.add(rid)
        out.append(line)
    path.write_text("\n".join(out) + ("\n" if out else ""), encoding="utf-8")
    print(f"Deduped → {len(out)} unique ids in {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
