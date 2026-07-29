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


def _cubic(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 28,
) -> list[tuple[float, float]]:
    """Sample a cubic Bézier for smooth European sedan outlines."""
    pts: list[tuple[float, float]] = []
    for i in range(steps + 1):
        t = i / steps
        u = 1.0 - t
        x = (
            u**3 * p0[0]
            + 3 * u**2 * t * p1[0]
            + 3 * u * t**2 * p2[0]
            + t**3 * p3[0]
        )
        y = (
            u**3 * p0[1]
            + 3 * u**2 * t * p1[1]
            + 3 * u * t**2 * p2[1]
            + t**3 * p3[1]
        )
        pts.append((x, y))
    return pts


def draw_car(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    scale: float,
    fill: tuple[int, ...],
    glass: tuple[int, ...] | None = None,
) -> None:
    """
    Low, elongated sedan silhouette — soft continuous curves (US/EU taste).
    Longer wheelbase, gentle roof arc, rounded nose and rear.
    """
    s = scale
    glass_fill = glass if glass is not None else (8, 12, 22, 255)

    # Lower / longer proportions than a boxy hatch
    y_rocker = cy + 0.10 * s
    y_belt = cy + 0.01 * s
    y_roof = cy - 0.22 * s

    nose_low = (cx - 0.48 * s, y_rocker)
    tail_low = (cx + 0.48 * s, y_rocker)

    # Smooth rocker
    lower = _cubic(
        nose_low,
        (cx - 0.18 * s, y_rocker + 0.015 * s),
        (cx + 0.18 * s, y_rocker + 0.015 * s),
        tail_low,
        18,
    )
    # Rounded rear into trunk line
    rear_up = _cubic(
        tail_low,
        (cx + 0.52 * s, y_belt + 0.04 * s),
        (cx + 0.50 * s, y_belt - 0.02 * s),
        (cx + 0.38 * s, y_belt - 0.05 * s),
        18,
    )
    # Single gentle roof arc (no center peak)
    roof = _cubic(
        (cx + 0.38 * s, y_belt - 0.05 * s),
        (cx + 0.18 * s, y_roof),
        (cx - 0.06 * s, y_roof),
        (cx - 0.22 * s, y_belt - 0.06 * s),
        28,
    )
    # Long sloping hood
    hood = _cubic(
        (cx - 0.22 * s, y_belt - 0.06 * s),
        (cx - 0.32 * s, y_belt - 0.02 * s),
        (cx - 0.42 * s, y_belt + 0.02 * s),
        (cx - 0.48 * s, y_belt + 0.04 * s),
        18,
    )
    # Soft rounded nose
    front_close = _cubic(
        (cx - 0.48 * s, y_belt + 0.04 * s),
        (cx - 0.52 * s, y_belt + 0.08 * s),
        (cx - 0.51 * s, y_rocker + 0.01 * s),
        nose_low,
        14,
    )

    outline = lower + rear_up[1:] + roof[1:] + hood[1:] + front_close[1:]
    draw.polygon(outline, fill=fill)

    # Wide cabin glass with soft corners
    win_top = _cubic(
        (cx - 0.18 * s, y_belt - 0.01 * s),
        (cx - 0.10 * s, y_roof + 0.05 * s),
        (cx + 0.12 * s, y_roof + 0.05 * s),
        (cx + 0.28 * s, y_belt - 0.03 * s),
        22,
    )
    win_bot = _cubic(
        (cx + 0.28 * s, y_belt - 0.03 * s),
        (cx + 0.10 * s, y_belt + 0.015 * s),
        (cx - 0.04 * s, y_belt + 0.015 * s),
        (cx - 0.18 * s, y_belt - 0.01 * s),
        12,
    )
    draw.polygon(win_top + win_bot[1:], fill=glass_fill)

    # Slightly larger wheels, planted on the rocker
    r = 0.10 * s
    for wx in (cx - 0.28 * s, cx + 0.28 * s):
        wy = y_rocker + 0.015 * s
        draw.ellipse((wx - r, wy - r, wx + r, wy + r), fill=fill)
        hr = r * 0.36
        draw.ellipse((wx - hr, wy - hr, wx + hr, wy + hr), fill=glass_fill)


def make_icon_only(size: int = 1024) -> Image.Image:
    # 2× supersample for smoother Bézier edges
    hi = size * 2
    img = Image.new("RGBA", (hi, hi), BG)
    draw = ImageDraw.Draw(img)
    pad = hi * 0.12
    rounded_rect(draw, (pad, pad, hi - pad, hi - pad), radius=hi * 0.22, fill=CYAN)
    draw_car(draw, hi / 2, hi / 2 + hi * 0.02, hi * 0.55, INK, glass=CYAN)
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    out = Image.new("RGB", (size, size), BG[:3])
    out.paste(img, mask=img.split()[-1])
    return out


def make_icon_foreground(size: int = 1024) -> Image.Image:
    """Adaptive icon foreground: mark inside ~66% safe zone, transparent outside."""
    hi = size * 2
    img = Image.new("RGBA", (hi, hi), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = hi * 0.18
    rounded_rect(draw, (pad, pad, hi - pad, hi - pad), radius=hi * 0.18, fill=CYAN)
    draw_car(draw, hi / 2, hi / 2 + hi * 0.015, hi * 0.48, INK, glass=CYAN)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def make_icon_background(size: int = 1024) -> Image.Image:
    return Image.new("RGB", (size, size), BG[:3])


def make_splash(size: int = 2732) -> Image.Image:
    hi = size  # already large; light supersample via 1.5× if memory ok
    scale_f = 2
    canvas = size * scale_f
    img = Image.new("RGBA", (canvas, canvas), (*BG[:3], 255))
    draw = ImageDraw.Draw(img)
    tile = canvas * 0.22
    left = (canvas - tile) / 2
    top = (canvas - tile) / 2 - canvas * 0.02
    rounded_rect(draw, (left, top, left + tile, top + tile), radius=tile * 0.22, fill=CYAN)
    draw_car(
        draw,
        canvas / 2,
        canvas / 2 - canvas * 0.02 + tile * 0.02,
        tile * 0.55,
        INK,
        glass=CYAN,
    )
    return img.resize((size, size), Image.Resampling.LANCZOS).convert("RGB")


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
