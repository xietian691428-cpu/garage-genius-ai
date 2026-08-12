# DIY visual standards (Garage Genius)

For US/EU DIY users: prefer one clear photo over decorative art.

## Categories

| Class | Use for | Prefer | Avoid |
|-------|---------|--------|-------|
| **A. Location** | Where on the car | Photoreal side/detail + labeled hotspot | Abstract blobs without labels |
| **B. Part ID** | What the part looks like | Close-up photo + part name under the frame | Stock art that doesn’t match the part |
| **C. Step action** | How to do it | Photo showing hand/tool/part relationship, or skip image and use bullets + one reference still | Cartoon sequences that hide orientation |

## Frame rules

- Aspect: ~16:10 for step heroes; square OK for part close-ups
- Dark inset (`#070b14` / `slate-900`), `rounded-2xl`, subtle border
- **Always** show a short text label next to/under the image (name or location) — never image-only
- Safety-critical steps: photo style + warning copy; never rely on cute illustrations
- Missing or failed load: honest empty state (“Photo reference not available”) — do **not** invent a wrong part picture
- If caption/part number disagrees with the image, **hide the image** and keep the text

## Coach assets

JSON may reference `/coach/...` files. Until real photos ship, players must degrade to text + empty frame (see `CoachStepVisual`). Do not substitute random clipart.

## Dashboard map

Body-class / Tesla side photos are **location maps** (Class A), not brand-accurate trim guides. Labels + numbered chips carry meaning.
