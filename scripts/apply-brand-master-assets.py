#!/usr/bin/env python3
"""
Build Capacitor resources/* from the designer master icon (1024²).

Master: dark outer (#0a0f1c) + cyan rounded tile + black streamlined car.
Outputs Full-Control sources for @capacitor/assets.
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "resources"
MASTER_CANDIDATES = [
    OUT / "brand-master.png",
    Path(
        "/Users/xietian/.cursor/projects/Users-xietian-garage-genius-ai/assets/"
        "ChatGPT_Image_2026_7_29__16_23_43-3dc911eb-3cc8-4259-b2fa-afa3690b7dab.png"
    ),
]

BG = (10, 15, 28)
CYAN = (34, 211, 238)


def find_master() -> Path:
    for p in MASTER_CANDIDATES:
        if p.is_file():
            return p
    raise SystemExit(
        "Missing brand master PNG. Place resources/brand-master.png (1024×1024)."
    )


def is_dark_outer(rgb: tuple[int, ...]) -> bool:
    r, g, b = rgb[:3]
    # Outer navy / near-black (not the car body which is also dark but inside cyan)
    return r < 40 and g < 45 and b < 55 and (r + g + b) < 100


def make_icon_only(master: Image.Image, size: int = 1024) -> Image.Image:
    img = master.convert("RGB")
    if img.size != (size, size):
        img = img.resize((size, size), Image.Resampling.LANCZOS)
    return img


def make_icon_foreground(master: Image.Image, size: int = 1024) -> Image.Image:
    """Cyan tile + car with transparent outer navy (adaptive safe zone)."""
    src = master.convert("RGBA")
    if src.size != (size, size):
        src = src.resize((size, size), Image.Resampling.LANCZOS)
    px = src.load()
    assert px is not None
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    opx = out.load()
    assert opx is not None
    for y in range(size):
        for x in range(size):
            r, g, b, a = px[x, y]
            if is_dark_outer((r, g, b)):
                opx[x, y] = (0, 0, 0, 0)
            else:
                opx[x, y] = (r, g, b, 255)
    return out


def make_icon_background(size: int = 1024) -> Image.Image:
    return Image.new("RGB", (size, size), BG)


def make_splash(master: Image.Image, size: int = 2732) -> Image.Image:
    """Dark full-bleed + centered mark (same composition as icon)."""
    canvas = Image.new("RGB", (size, size), BG)
    mark = make_icon_only(master, 1024)
    # Scale mark to ~42% of splash for breathing room
    mark_size = int(size * 0.42)
    mark = mark.resize((mark_size, mark_size), Image.Resampling.LANCZOS)
    x = (size - mark_size) // 2
    y = (size - mark_size) // 2
    canvas.paste(mark, (x, y))
    return canvas


def main() -> None:
    src_path = find_master()
    OUT.mkdir(parents=True, exist_ok=True)
    dest_master = OUT / "brand-master.png"
    if src_path.resolve() != dest_master.resolve():
        shutil.copy2(src_path, dest_master)
        print(f"Copied master → {dest_master}")

    master = Image.open(dest_master)
    print(f"Master: {dest_master} {master.size} {master.mode}")

    make_icon_only(master).save(OUT / "icon-only.png", optimize=True)
    make_icon_foreground(master).save(OUT / "icon-foreground.png", optimize=True)
    make_icon_background().save(OUT / "icon-background.png", optimize=True)
    splash = make_splash(master)
    splash.save(OUT / "splash.png", optimize=True)
    splash.save(OUT / "splash-dark.png", optimize=True)

    for name in (
        "icon-only.png",
        "icon-foreground.png",
        "icon-background.png",
        "splash.png",
        "splash-dark.png",
    ):
        p = OUT / name
        with Image.open(p) as im:
            print(f"  {name}: {im.size[0]}×{im.size[1]} {im.mode}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:  # noqa: BLE001
        print(exc, file=sys.stderr)
        raise SystemExit(1) from exc
