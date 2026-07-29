#!/usr/bin/env python3
"""
Generate Garage Genius Capacitor source images into resources/.

Brand:
  bg #0a0f1c · accent #22d3ee · mark = cyan rounded square + dark car silhouette
  (matches landing .landing-brand-icon)

Outputs (Full Control mode for @capacitor/assets):
  resources/icon-only.png         1024² opaque (App Store / Play)
  resources/icon-foreground.png   1024² transparent car mark (adaptive safe zone)
  resources/icon-background.png   1024² solid brand bg
  resources/splash.png            2732² logo centered on brand bg
  resources/splash-dark.png       same (app is dark-first)
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "resources"

BG = (10, 15, 28, 255)  # #0a0f1c
CYAN = (34, 211, 238, 255)  # #22d3ee
INK = (2, 6, 23, 255)  # #020617


def rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    radius: float,
    fill: tuple[int, ...],
) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_car(draw: ImageDraw.ImageDraw, cx: float, cy: float, scale: float, fill: tuple[int, ...]) -> None:
    """Simplified side-view car (readable at small sizes)."""
    s = scale
    # body
    body = [
        (cx - 0.42 * s, cy + 0.02 * s),
        (cx - 0.28 * s, cy - 0.18 * s),
        (cx - 0.05 * s, cy - 0.28 * s),
        (cx + 0.22 * s, cy - 0.28 * s),
        (cx + 0.38 * s, cy - 0.08 * s),
        (cx + 0.44 * s, cy + 0.02 * s),
        (cx + 0.42 * s, cy + 0.14 * s),
        (cx - 0.40 * s, cy + 0.14 * s),
    ]
    draw.polygon(body, fill=fill)
    # cabin window
    win = [
        (cx - 0.18 * s, cy - 0.06 * s),
        (cx - 0.02 * s, cy - 0.22 * s),
        (cx + 0.16 * s, cy - 0.22 * s),
        (cx + 0.26 * s, cy - 0.06 * s),
    ]
    # slight cut — use darker cyan tint by drawing over with bg-ish ink blend
    draw.polygon(win, fill=(fill[0], fill[1], fill[2], 60) if len(fill) == 4 and fill[3] < 255 else (8, 12, 22, 255))
    # wheels
    r = 0.09 * s
    draw.ellipse((cx - 0.28 * s - r, cy + 0.12 * s - r, cx - 0.28 * s + r, cy + 0.12 * s + r), fill=fill)
    draw.ellipse((cx + 0.22 * s - r, cy + 0.12 * s - r, cx + 0.22 * s + r, cy + 0.12 * s + r), fill=fill)


def make_icon_only(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    pad = size * 0.12
    rounded_rect(draw, (pad, pad, size - pad, size - pad), radius=size * 0.22, fill=CYAN)
    # car in dark ink on cyan tile
    draw_car(draw, size / 2, size / 2 + size * 0.02, size * 0.55, INK)
    # flatten to RGB (no transparency — App Store requirement)
    out = Image.new("RGB", (size, size), BG[:3])
    out.paste(img, mask=img.split()[-1])
    return out


def make_icon_foreground(size: int = 1024) -> Image.Image:
    """Adaptive icon foreground: mark inside ~66% safe zone, transparent outside."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # safe zone roughly center 66%
    pad = size * 0.18
    rounded_rect(draw, (pad, pad, size - pad, size - pad), radius=size * 0.18, fill=CYAN)
    draw_car(draw, size / 2, size / 2 + size * 0.015, size * 0.48, INK)
    return img


def make_icon_background(size: int = 1024) -> Image.Image:
    return Image.new("RGB", (size, size), BG[:3])


def make_splash(size: int = 2732) -> Image.Image:
    img = Image.new("RGB", (size, size), BG[:3])
    overlay = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    tile = size * 0.22
    left = (size - tile) / 2
    top = (size - tile) / 2 - size * 0.02
    rounded_rect(draw, (left, top, left + tile, top + tile), radius=tile * 0.22, fill=CYAN)
    draw_car(draw, size / 2, size / 2 - size * 0.02 + tile * 0.02, tile * 0.55, INK)
    img = img.convert("RGBA")
    img = Image.alpha_composite(img, overlay)
    return img.convert("RGB")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    make_icon_only().save(OUT / "icon-only.png", optimize=True)
    make_icon_foreground().save(OUT / "icon-foreground.png", optimize=True)
    make_icon_background().save(OUT / "icon-background.png", optimize=True)
    splash = make_splash()
    splash.save(OUT / "splash.png", optimize=True)
    splash.save(OUT / "splash-dark.png", optimize=True)
    print(f"Wrote sources to {OUT}")
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
    main()
