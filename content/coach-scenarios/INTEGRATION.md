# Coach scenarios — production integration (US/EU, English)

Ship only `*_production.json`. Locale: **English**.

In-app: **Coach Guides** (`/app?tab=coach`) → `lib/coach-scenarios/catalog.ts` + `components/coach/CoachScenarioPlayer.tsx`.

## Files

### Phase 1 — core (5)

| Playbook | Slug |
| --- | --- |
| `maintenance_oil_production.json` | maintenance_oil |
| `maintenance_brakes_production.json` | maintenance_brakes |
| `maintenance_tires_production.json` | maintenance_tires |
| `maintenance_battery_production.json` | maintenance_battery |
| `diagnosis_check_engine_production.json` | diagnosis_check_engine |

### Phase 2 — extended (7)

| Playbook | Slug |
| --- | --- |
| `maintenance_ev_charging_production.json` | maintenance_ev_charging |
| `maintenance_ac_cooling_production.json` | maintenance_ac_cooling |
| `maintenance_winter_prep_production.json` | maintenance_winter_prep |
| `maintenance_transmission_cvt_production.json` | maintenance_transmission_cvt |
| `maintenance_road_trip_production.json` | maintenance_road_trip |
| `maintenance_high_mileage_production.json` | maintenance_high_mileage |
| `inspection_used_car_production.json` | inspection_used_car |

### Phase 3 Batch 1 — specialty (5)

| Playbook | Slug |
| --- | --- |
| `maintenance_luxury_euro_production.json` | maintenance_luxury_euro |
| `maintenance_value_luxury_production.json` | maintenance_value_luxury |
| `maintenance_alignment_balance_production.json` | maintenance_alignment_balance |
| `maintenance_suspension_struts_production.json` | maintenance_suspension_struts |
| `diagnosis_exhaust_emissions_production.json` | diagnosis_exhaust_emissions |

### Phase 3 Batch 2 — specialty (5)

| Playbook | Slug |
| --- | --- |
| `maintenance_fuel_injectors_production.json` | maintenance_fuel_injectors |
| `maintenance_cooling_water_pump_production.json` | maintenance_cooling_water_pump |
| `diagnosis_electrical_lights_sensors_production.json` | diagnosis_electrical_lights_sensors |
| `maintenance_body_paint_production.json` | maintenance_body_paint |
| `maintenance_summer_rain_prep_production.json` | maintenance_summer_rain_prep |

### Phase 3 Batch 3 — specialty final (5)

| Playbook | Slug |
| --- | --- |
| `maintenance_modified_car_production.json` | maintenance_modified_car |
| `maintenance_towing_prep_production.json` | maintenance_towing_prep |
| `maintenance_offroad_jeep_subaru_production.json` | maintenance_offroad_jeep_subaru |
| `maintenance_classic_vintage_production.json` | maintenance_classic_vintage |
| `diagnosis_insurance_post_accident_production.json` | diagnosis_insurance_post_accident |

**Total shipped: 27 production playbooks.**

## Contract (all phases)

1. Every step: `safety_disclaimer` (EN)
2. High-risk: `risk_confirm` + *I have read and understand the risks*; cancel = **Find a nearby shop**
3. `coach_encourage` + progress % + `{{mileage}}` / `{{next_service}}`
4. ≤2 buttons; GIF/video first
5. `show_step_feedback`: **Was this step useful?** → `POST /api/coach/feedback`

## Focus router notes (Batch 2)

- `lights` → electrical lights/sensors
- Summer months (May–Sep) + tires/default seasonal → summer/rain prep
- Fuel/cooling opened from Guides library (engine-adjacent)

## Recommended Guides notes (Batch 3)

- Jeep / Subaru make → off-road specialty
- Tags `Modified` / `Tow` / `Classic` (or year ≤ 1995) → matching Batch 3 guides
- Insurance / post-accident opened from Guides library (safety)

## Recommended Guides + Annual Health Report

- `listRecommendedCoachPlaybooks(vehicle)` ranks 3–5 playbooks by mileage, season, make, and inferred powertrain.
- CoachLibrary shows **Recommended Guides** above the full catalog; Dashboard / Coach CTAs export **Annual Health Report** (Pro+ via `features.annualHealthReport`).
- Free users keep **Export Snapshot**; annual PDF is gated with UpgradeModal.
- Vehicle profile → coach: `toCoachVehicleContext()` (`lib/coach-scenarios/vehicle-context.ts`) injects YMM, mileage, market, tags, powertrain into the player.

## Vehicle profile (onboarding + archive)

- Onboarding captures **mileage** + optional tags (`Modified` / `Tow` / `Classic` / `EV` / `Daily Driver`) for recommendations.
- Soft-archive: migration `021_user_vehicles_archive.sql` (`archived_at`); Chat → Vehicle profiles → Archive / Delete.
- Apply migration before relying on archive filter in production.

## Step feedback

- Player always shows **Was this step useful?** when `ux_rules.show_step_feedback` is true.
- “No” opens an optional note (max 500 chars) → `POST /api/coach/feedback` (`note` column).

## i18n

- See [`docs/I18N.md`](../../docs/I18N.md) — i18next with `en-US` + `es`.

## QA adds (Batch 2)

- [ ] Fuel flow never CTAs DIY high-pressure GDI rail cracking
- [ ] Cooling flow never opens a hot cap
- [ ] Electrical flow never probes SRS/yellow connectors
- [ ] Body flow prefers two-bucket wash; rust blisters escalate to shop
- [ ] Summer/rain warns not to bleed hot tire pressures

## QA adds (Batch 3)

- [ ] Modified flow never CTAs DIY random ECU flashes / boost raises
- [ ] Towing flow prioritizes ratings + hitch critical modal
- [ ] Off-road flow never encourages untrained winching; under-vehicle uses stands warning
- [ ] Classic flow warns asbestos brake dust + structural rust shop line
- [ ] Insurance flow: not legal advice; SRS yellow connectors banned; drive/no-drive critical
