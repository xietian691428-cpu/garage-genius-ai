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
    Streamlined side-view sedan — soft Bézier silhouette for Western/EU taste.
    Readable at small sizes; rounded nose, arched roof, soft rear.
    """
    s = scale
    glass_fill = glass if glass is not None else (8, 12, 22, 255)

    y_rocker = cy + 0.12 * s
    y_belt = cy - 0.02 * s
    y_roof = cy - 0.30 * s

    nose_low = (cx - 0.44 * s, y_rocker - 0.01 * s)
    tail_low = (cx + 0.44 * s, y_rocker - 0.02 * s)

    # Lower edge nose → tail
    lower = _cubic(
        nose_low,
        (cx - 0.20 * s, y_rocker + 0.02 * s),
        (cx + 0.18 * s, y_rocker + 0.02 * s),
        tail_low,
        16,
    )
    # Soft rear bumper up to trunk
    rear_up = _cubic(
        tail_low,
        (cx + 0.48 * s, y_belt + 0.06 * s),
        (cx + 0.46 * s, y_belt - 0.02 * s),
        (cx + 0.36 * s, y_belt - 0.06 * s),
        16,
    )
    # Trunk → arched roof → A-pillar
    roof = _cubic(
        (cx + 0.36 * s, y_belt - 0.06 * s),
        (cx + 0.28 * s, y_roof + 0.02 * s),
        (cx + 0.06 * s, y_roof - 0.02 * s),
        (cx - 0.10 * s, y_roof + 0.01 * s),
        22,
    )
    # Smooth hood down to nose
    hood = _cubic(
        (cx - 0.10 * s, y_roof + 0.01 * s),
        (cx - 0.22 * s, y_belt - 0.10 * s),
        (cx - 0.34 * s, y_belt - 0.04 * s),
        (cx - 0.44 * s, y_belt + 0.02 * s),
        18,
    )
    # Soft front bumper closing
    front_close = _cubic(
        (cx - 0.44 * s, y_belt + 0.02 * s),
        (cx - 0.48 * s, y_belt + 0.08 * s),
        (cx - 0.47 * s, y_rocker - 0.02 * s),
        nose_low,
        12,
    )

    outline = lower + rear_up[1:] + roof[1:] + hood[1:] + front_close[1:]
    draw.polygon(outline, fill=fill)

    # Cabin glass — soft bubble
    win = _cubic(
        (cx - 0.14 * s, y_belt - 0.02 * s),
        (cx - 0.08 * s, y_roof + 0.06 * s),
        (cx + 0.14 * s, y_roof + 0.05 * s),
        (cx + 0.26 * s, y_belt - 0.04 * s),
        20,
    )
    win_bottom = _cubic(
        (cx + 0.26 * s, y_belt - 0.04 * s),
        (cx + 0.12 * s, y_belt + 0.02 * s),
        (cx - 0.02 * s, y_belt + 0.02 * s),
        (cx - 0.14 * s, y_belt - 0.02 * s),
        12,
    )
    draw.polygon(win + win_bottom[1:], fill=glass_fill)

    # Wheels
    r = 0.095 * s
    for wx in (cx - 0.26 * s, cx + 0.24 * s):
        wy = y_rocker + 0.02 * s
        draw.ellipse((wx - r, wy - r, wx + r, wy + r), fill=fill)
        hr = r * 0.38
        draw.ellipse((wx - hr, wy - hr, wx + hr, wy + hr), fill=glass_fill)


def make_icon_only(size: int = 1024) -> Image.Image:
    img = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)
    pad = size * 0.12
    rounded_rect(draw, (pad, pad, size - pad, size - pad), radius=size * 0.22, fill=CYAN)
    draw_car(
        draw,
        size / 2,
        size / 2 + size * 0.02,
        size * 0.55,
        INK,
        glass=CYAN,
    )
    out = Image.new("RGB", (size, size), BG[:3])
    out.paste(img, mask=img.split()[-1])
    return out


def make_icon_foreground(size: int = 1024) -> Image.Image:
    """Adaptive icon foreground: mark inside ~66% safe zone, transparent outside."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size * 0.18
    rounded_rect(draw, (pad, pad, size - pad, size - pad), radius=size * 0.18, fill=CYAN)
    draw_car(
        draw,
        size / 2,
        size / 2 + size * 0.015,
        size * 0.48,
        INK,
        glass=CYAN,
    )
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
    draw_car(
        draw,
        size / 2,
        size / 2 - size * 0.02 + tile * 0.02,
        tile * 0.55,
        INK,
        glass=CYAN,
    )
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
