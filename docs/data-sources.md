# Data sources — what we use, what we defer

Garage Genius coaches DIY from **free official facts + local catalogs + playbooks**.
Paid repair databases stay off until the product log says they are actually the bottleneck.

## In use (no extra license)

| Source | Market | Used for | Not used for |
|---|---|---|---|
| NHTSA vPIC | VIN decode (global VIN) | Year / make / model / engine fill | Recalls on non-US cars |
| NHTSA Recalls API | **`market=US` only** | Educational campaign list (YMM, max 3) | “This VIN is unrepaired”, EU/UK campaigns |
| EPA FuelEconomy.gov | US MPG questions | Official city/highway/combined | Invented oil capacity or torque |
| Local DTC JSON (`content/dtc/`) | US + EU | `[DTC_REF]` titles / DIY level | OEM definitions for unknown codes |
| Coach playbooks (`*_production.json`) | All | Guided checks + safety-topics | Player state-machine changes |
| Owner’s manual / dealer | All | Fluids, torque, intervals when we have no anchor | We tell the owner to look it up — we do not scrape OEM portals |

Recalls and insurance stay **education only**: *may be affected* / *verify with VIN or dealer*. Never “already fixed”, “won’t claim”, or “Replace X now”.

Full VIN is never written to Chat prompts or product logs (last 8 only).

## Paid data deferred; revisit when…

**Not in this product:** Auto.dev, ALLDATA, Mitchell, CarMD paid APIs, commercial EU recall feeds, DVSA MOT lookup, country-site scrapers. No client or API wiring for those services.

Open an Auto.dev (or similar) **POC only if all** of the following are true:

1. **Volume** — Admin → Token Usage → “Spec-gap demand” shows oil viscosity/capacity, maintenance interval, or torque at **≥ 15% of Chat turns** in a 30-day window **and ≥ 20 hits** on that tag (`lib/spec-gap-intent.ts`). Volume alone is not a buy decision.
2. **Coverage gap** — The same asks still fail after NHTSA/EPA/local DTC + the matching playbook + a clear “check the owner’s manual / dealer with VIN” close. If playbooks and “look it up” already answer safely, do not buy a database.
3. **Margin** — AI cost hard cap still holds; a paid spec API must not blow the ~30% COGS target.

Until then: keep injecting official anchors (`[VEHICLE_ANCHOR]`, `[EPA_MPG]`, `[DTC_REF]`, `[DIY_PATH]`), refuse invented `x qt` / `xx ft-lb` / OEM part numbers, and send the owner to the manual. If EPA is down on an MPG question, skip numbers and point to the window sticker / fueleconomy.gov.

Product log: Chat stamps tags only on existing `token_usage_events.metadata.spec_gap` (no new table, no message text, no VIN). Admin aggregates hits vs Chat share. There is no Auto.dev integration code.
