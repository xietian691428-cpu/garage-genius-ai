# Intake slots, evidence grades, stop rules (W8)

Chat should **ask like a tech first, then narrow** — via pipeline blocks, not free-form model improvisation alone.

## Design: ephemeral intake (no second persistence)

| Concern | Mechanism |
| --- | --- |
| Drift / CRITICAL safety focus | Existing `TurnFocus` in localStorage (`garageGenius_chatFocus_*`) — **unchanged** |
| Intake slots | Derived **per request** from current + recent user text (`lib/intake/derive.ts`) |
| Lighting confirm | Same transcript parsers feed `resolveLightingPath` |

Do **not** write intake into TurnFocus. Hard reset / CRITICAL rules stay on drift only.

## Slots (`[INTAKE_STATE]`)

Generic: `symptom_summary`, `when_started`, `sudden_or_gradual`, `intermittent_or_constant`, `after_event`, `side`, `conditions`, `already_tried`, `dtc_list`, `evidence_level`.

Lighting-aligned (same object): `lighting_structure`, `lighting_function`, `housing_confirm`, `trim_or_package`.

Battery / cranking (W9): `battery_symptom` (no_crank / slow_crank / clicks / starts_then_dies), `lights_dim`, `recent_battery_work`, `parked_days`, `weather_cold`.

Overheat (W9): `temp_gauge_or_light`, `steam`, `level_checked_cold`, `recent_cooling_work`.

Rules:

1. Lighting + `lighting_structure=unknown` → no bulb sizes; confirm chips/prompts first.
2. After dust-cap / sealed confirm → update path confidence; then buy/Coach chips.
3. Battery/overheat: ask ≤2 high-value slots before parts dumps; never “Replace battery now.”
4. Overheat + steam → do not drive / no hot radiator-cap DIY (prompt + output gate).
5. Non-lighting “what’s broken?” with missing when/intermittent → ask ≤2 high-value questions.
6. No full VIN in intake text.

## Evidence grades (`[EVIDENCE]`)

| Grade | Meaning |
| --- | --- |
| OBSERVED | Clear owner statement, OBD/DTC ref, confirmed housing |
| REPORTED | Estimate / hearsay |
| INFERRED | Possible/likely directions only |
| UNVERIFIED | No-anchor specs / unconfirmed structure — never as fact |

Preferred reply shape: What we know → What we still need → Likely directions → Next safest checks → Stop / see a pro.

## Stop rules (`[STOP_RULE]`)

`content/safety/stop-rules.json` + `lib/safety/stop-rules.ts`. On hit: no deep DIY / coding steps; arrange qualified tech; optional pre-shop recording tips.

Covers SRS/pretensioner, brake hydraulics/ABS deep, hot cooling cap, HV orange, adaptive/matrix coding, ADAS camera-on-lamp.

## DTC `check_order`

Local catalog entries may include ordered educational checks (e.g. P0420). Injected in `[DTC_REF]`. Model guides in order; skips allowed if noted. Never root-cause “Replace X now.”

## Pipeline insert (`/api/chat`)

After unit/insurance/drive-safety + drift prep, before DeepSeek messages:

1. `deriveIntake` from transcript  
2. Inject `[INTAKE_STATE]` `[EVIDENCE]` `[STOP_RULE?]`  
3. `[LIGHTING_PATH]` / `[DTC_REF]` already from anchors (lighting uses `transcriptBlob` for confirms)

## Hand-test (Camry US, English)

| Step | Say | Expect |
| --- | --- | --- |
| A | “Low beam out — what should I buy?” | Structure confirm first; no definitive H11 |
| B | “Dust cap I can unscrew” | Replaceable path + bulb steps chip |
| C | “Factory sealed LED assembly” | Assembly path; no halogen bulb size |
| D | “P0420” | Ordered check_order; no Replace converter now |
| E | “Matrix headlight needs coding” | `[STOP_RULE]` / see a professional |

## Related

- [LIGHTING_FITMENT.md](./LIGHTING_FITMENT.md) — structure confirm gate  
- [RESIDUAL_RISKS.md](./RESIDUAL_RISKS.md) — W8 residuals  
