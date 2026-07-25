#!/usr/bin/env python3
"""
Public-source harvest (no residential proxy required).

Sources:
  carcomplaints — structured owner fault reports
  repaircost    — RepairPal (if reachable) + YourMechanic estimates
  ratings       — Consumer Reports public teasers + IIHS (+ JDP if reachable)
  serp          — DuckDuckGo SERP snippets for site:reddit.com owner reviews

Each source writes a temp JSONL, then results are merged into raw_posts.jsonl
(safe under --parallel).

Usage:
  ./run.sh public --smoke
  ./run.sh public --models=rav4,f-150,cr-v
  ./run.sh public --sources=carcomplaints,repaircost,ratings,serp --parallel
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PY = sys.executable
TOOLS = ROOT / "tools"
RAW_OUT = ROOT / "output" / "raw_posts.jsonl"
TMP_DIR = ROOT / "output" / "tmp_public"

SOURCE_CMDS = {
    "carcomplaints": ["harvest_carcomplaints.py"],
    "repaircost": ["harvest_repair_costs.py"],
    "ratings": ["harvest_public_ratings.py", "--skip-jdp"],
    "serp": ["harvest_serp_reddit.py"],
}


def run_one(name: str, script_args: list[str], extra: list[str], out_path: Path) -> tuple[str, int, str]:
    cmd = [
        PY,
        str(TOOLS / script_args[0]),
        *script_args[1:],
        *extra,
        "--out",
        str(out_path),
    ]
    print(f"\n>>> START {name}: {' '.join(cmd)}", flush=True)
    p = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    out = (p.stdout or "") + (p.stderr or "")
    print(out, flush=True)
    print(f"<<< END {name} rc={p.returncode}", flush=True)
    return name, p.returncode, out


def merge_temps(tmp_files: list[Path], dest: Path) -> int:
    seen: set[str] = set()
    if dest.is_file():
        for line in dest.read_text(encoding="utf-8").splitlines():
            try:
                rid = json.loads(line).get("raw_id")
                if rid:
                    seen.add(rid)
            except json.JSONDecodeError:
                continue
    added = 0
    with dest.open("a", encoding="utf-8") as fh:
        for tmp in tmp_files:
            if not tmp.is_file():
                continue
            for line in tmp.read_text(encoding="utf-8").splitlines():
                if not line.strip():
                    continue
                try:
                    row = json.loads(line)
                except json.JSONDecodeError:
                    continue
                rid = row.get("raw_id")
                if not rid or rid in seen:
                    continue
                seen.add(rid)
                fh.write(json.dumps(row, ensure_ascii=False) + "\n")
                added += 1
    return added


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--models", default=None, help='e.g. "rav4,f-150,cr-v"')
    ap.add_argument(
        "--sources",
        default="carcomplaints,repaircost,ratings,serp",
        help="Comma list of sources",
    )
    ap.add_argument("--smoke", action="store_true", help="RAV4 only, smaller caps")
    ap.add_argument("--per-model-cc", type=int, default=30)
    ap.add_argument("--per-model-serp", type=int, default=20)
    ap.add_argument("--jobs", type=int, default=4)
    ap.add_argument(
        "--parallel",
        action="store_true",
        help="Run sources concurrently (each writes its own temp file)",
    )
    ap.add_argument("--keep-tmp", action="store_true")
    args = ap.parse_args()

    models = args.models
    if args.smoke:
        models = "rav4"
        args.per_model_cc = min(args.per_model_cc, 12)
        args.per_model_serp = min(args.per_model_serp, 10)

    sources = [s.strip().lower() for s in args.sources.split(",") if s.strip()]
    unknown = [s for s in sources if s not in SOURCE_CMDS]
    if unknown:
        print(f"Unknown sources: {unknown}. Choose from {list(SOURCE_CMDS)}")
        return 2

    extras_by_source: dict[str, list[str]] = {
        "carcomplaints": ["--per-model", str(args.per_model_cc)],
        "serp": ["--per-model", str(args.per_model_serp)],
        "repaircost": [],
        "ratings": [],
    }
    if models:
        for k in extras_by_source:
            extras_by_source[k] = ["--models", models, *extras_by_source[k]]

    TMP_DIR.mkdir(parents=True, exist_ok=True)
    tmp_files = {name: TMP_DIR / f"{name}.jsonl" for name in sources}
    for p in tmp_files.values():
        p.write_text("", encoding="utf-8")

    results: list[tuple[str, int]] = []
    if args.parallel and len(sources) > 1:
        with ThreadPoolExecutor(max_workers=max(1, min(args.jobs, len(sources)))) as pool:
            futs = {
                pool.submit(
                    run_one,
                    name,
                    SOURCE_CMDS[name],
                    extras_by_source.get(name, []),
                    tmp_files[name],
                ): name
                for name in sources
            }
            for fut in as_completed(futs):
                name, rc, _ = fut.result()
                results.append((name, rc))
    else:
        for name in sources:
            name, rc, _ = run_one(
                name,
                SOURCE_CMDS[name],
                extras_by_source.get(name, []),
                tmp_files[name],
            )
            results.append((name, rc))

    added = merge_temps([tmp_files[n] for n in sources], RAW_OUT)
    if not args.keep_tmp:
        for p in tmp_files.values():
            try:
                p.unlink()
            except OSError:
                pass

    print("\n=== public harvest summary ===")
    bad = 0
    for name, rc in sorted(results):
        print(f"  {name}: rc={rc}")
        if rc != 0:
            bad += 1
    print(f"merged +{added} new raw rows → {RAW_OUT}")
    print("Next: ./run.sh clean --provider=deepseek --limit=200")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
