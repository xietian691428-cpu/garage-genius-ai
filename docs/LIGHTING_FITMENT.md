# Exterior lighting fitment (education)

Garage Genius is an **educational lighting coach** (buy path → install → troubleshoot). It is not a parts marketplace, not a repair shop verdict, and not a legal ruling on FMVSS 108 / local lighting laws.

## What `[LIGHTING_PATH]` is

When Chat detects an exterior-lighting intent, `gatherVehicleFactAnchors` may inject a `[LIGHTING_PATH]` block from:

1. Weak YMM table: `content/lighting/ymm-common.json`
2. Optional owner notes/tags (`factory LED`, `halogen housing`, etc.)
3. Intent (buy / bulb install / assembly / LED upgrade / lens / troubleshoot)
4. **Session structure confirm** from owner text / chips (dust cap vs sealed) — W8

Structure paths (confidence language only — never 100%):

| Path | Meaning |
| --- | --- |
| `likely_replaceable_bulb` | Dust-cap / plug-in **confirmed** this session (or notes override) |
| `likely_sealed_or_integrated_led` | Sealed / integrated LED **confirmed** (or notes override) |
| `ambiguous_needs_confirm` | Structure **unconfirmed** — path capped here even if YMM row exists |

### Structure gate (W8)

- **Unconfirmed** → stay `ambiguous_needs_confirm`, confidence capped, **no** allowlisted bulb hint, Coach `lighting_replace_*` not preferred until match.
- **Confirmed replaceable** → path + optional weak-table hint with verify disclaimer.
- **Confirmed sealed** → assembly path; never push halogen sizes (H11/9005).

Intake slots (`lighting_structure`, `housing_confirm`) are ephemeral — see [INTAKE_AND_EVIDENCE.md](./INTAKE_AND_EVIDENCE.md).

## YMM coverage (weak table — not parts-grade)

`content/lighting/ymm-common.json` is an **educational** US-market sketch. It is **not** a parts catalog, not Amazon fitment, and **not** VIN-level option decoding.

| Make | Models (year ranges in JSON) | Notes |
| --- | --- | --- |
| Toyota | Camry, Corolla, RAV4, Tacoma, Highlander | Often `multiConfig` (halogen vs LED by trim) |
| Honda | Civic, Accord, CR-V, Pilot, HR-V | Often `multiConfig` |
| Ford | F-150, Escape, Explorer | Halogen vs LED packages — confirm first |
| Chevrolet | Silverado, Equinox, Malibu | Confirm before any H-number |
| GMC | Sierra | Confirm on THIS truck — do not copy Silverado blindly |
| Ram | 1500 | Package-heavy — no hard-coded bulb |
| Nissan | Altima, Rogue | Confirm housing |
| Hyundai | Tucson, Elantra | Confirm housing |
| Kia | Sportage, Forte | Confirm housing; hint only after dust-cap |
| Mazda | CX-5 | Confirm housing |
| Subaru | Outback | Older rows may hint H11 **only after** dust-cap confirm |
| Jeep | Grand Cherokee | Halogen / HID / LED mix |
| Volkswagen | Tiguan | Path education only (low confidence) — confirm first |
| Tesla | Model 3 | Sealed LED education |
| BMW | 3 Series | Sealed LED education |

`multiConfig: true` → path stays `ambiguous_needs_confirm` until the owner confirms dust-cap vs sealed (text/chips) **or** a high-confidence housing photo assist (W10b); **no bulb size** until then. Low-confidence photos never invent H-numbers. Missing rows are preferred over wrong H-numbers.

## YMM and VIN limits

- **YMM alone is not enough** when trims mix halogen and LED. The model must ask trim and/or housing rear view (dust cap + bulb vs heat sink / sealed module).
- **VIN is not treated as decoded lighting options** unless a real lighting fitment data source is wired. Full VIN never enters prompts (last-8 / mask rules still apply).
- **Bulb sizes (H11, 9005, …)** are emitted only after structure confirm **and** the weak table has an allowlisted hint — always with verify language. Unknown YMM → no invented size.

## LED / HID “upgrades”

Halogen housings with aftermarket LED/HID bulbs: teach beam pattern / glare and **may** conflict with FMVSS 108 or local rules. Prefer assemblies designed for that source. Never say “definitely legal” or “won’t be ticketed.”

## Coach guides (Player unchanged)

| Slug | Use |
| --- | --- |
| `lighting_replace_bulb` | Confirmed replaceable bulb DIY |
| `lighting_replace_assembly_basic` | Assembly path + shop exit |
| `lighting_lens_restore_edu` | Cloudy lens / moisture education |
| `diagnosis_electrical_lights_sensors` | Broader electrical / sensor diagnosis |

## Hand-test script

### A — Pre-sale (2020 Camry)

Chat (vehicle = 2020 Toyota Camry):  
“My low beam is out — should I buy a bulb or the whole headlight assembly?”

Expect: ambiguous / confirm trim or housing; **no** bulb size until confirm; not only an Amazon link; no “definitely sealed.”

### B — Install (after confirm bulb)

“I confirmed a dust cap and plug-in bulb. Walk me through low-beam bulb steps.”

Expect: replaceable path; optional allowlisted hint + verify; power off, don’t touch halogen glass; chip/open `lighting_replace_bulb`.

### C — After-sale

1. “I installed LED bulbs and oncoming cars flash me.” → glare + legality education, no “definitely legal.”  
2. “One headlight has water fog inside.” → moisture/seal education; lens guide optional.

### D — Missing data

Vehicle = obscure/unsupported YMM: “What bulb size is my low beam?”

Expect: no H11/9005 invention; confirm prompts; generic path.

## Putco fitment tool (read-only brand catalog)

When the owner asks whether **Putco** / truck lighting accessories **fit** this YMM (or explicit fitment), Chat may call Putco’s public AI API once:

- Endpoint: `GET https://www.putco.com/ai/fitment?year=&make=&model=&country=us|ca&schema=brief`
- OpenAPI: https://www.putco.com/ai/openapi.json — **no auth**, US/CA store only
- Inject: `[PUTCO_FITMENT]` with product titles/SKUs/urls (capped) +  
  `Source: Putco fitment API (brand catalog). Not OEM factory parts data. Verify on vehicle and seller listing.`

### Boundaries (hard)

| Rule | Behavior |
| --- | --- |
| Structure unconfirmed | Still ask dust-cap vs sealed; Putco must **not** alone emit H11/9005 |
| Not OEM truth | Never “OEM requires…” from Putco rows |
| EU / UK / AU market | **No** pretend ECE/UK approval; skip live call or inject `skipped_us_catalog_only` |
| VIN | Never sent to Putco — YMM (+ country) only |
| Failures | Timeout / HTTP → Chat continues; no invented SKU list |
| Cache | ~24h in-process key `year\|make\|model\|country`; ≤1 GET per turn |
| Scope | Oil change / DTC-only turns do **not** call Putco |

Code: `lib/putco/*`, wired in `app/api/chat/route.ts` after lighting intake.

## Residual risks

See [RESIDUAL_RISKS.md](./RESIDUAL_RISKS.md) W7 / W8 / Putco.

### Hand-test (Putco)

1. Vehicle = 2024 Ford F-150 (US): “Will Putco lights fit my truck?”  
   Expect: `[PUTCO_FITMENT]` (or unavailable degrade) + Source Putco; no OEM-required wording.
2. Vehicle = 2020 Camry: “Low beam out — what bulb?”  
   Expect: structure confirm first; no lone H11 from Putco (Putco usually not called on bare bulb ask).
