# Coach scenarios (interactive DIY flows)

Types: `lib/types/coach-scenario.ts`.

**Ship only `*_production.json`** — English (US/EU). In-app: `/app?tab=coach`.

## Phase 1 — core five

| File | Slug |
| --- | --- |
| `maintenance_oil_production.json` | maintenance_oil |
| `maintenance_brakes_production.json` | maintenance_brakes |
| `maintenance_tires_production.json` | maintenance_tires |
| `maintenance_battery_production.json` | maintenance_battery |
| `diagnosis_check_engine_production.json` | diagnosis_check_engine |

## Phase 2 — extended (7)

| File | Slug |
| --- | --- |
| `maintenance_ev_charging_production.json` | maintenance_ev_charging |
| `maintenance_ac_cooling_production.json` | maintenance_ac_cooling |
| `maintenance_winter_prep_production.json` | maintenance_winter_prep |
| `maintenance_transmission_cvt_production.json` | maintenance_transmission_cvt |
| `maintenance_road_trip_production.json` | maintenance_road_trip |
| `maintenance_high_mileage_production.json` | maintenance_high_mileage |
| `inspection_used_car_production.json` | inspection_used_car |

## Phase 3 — specialty Batch 1 (5)

| File | Slug | Notes |
| --- | --- | --- |
| `maintenance_luxury_euro_production.json` | maintenance_luxury_euro | Porsche/BMW approvals + electronics |
| `maintenance_value_luxury_production.json` | maintenance_value_luxury | Genesis/Acura value care + ADAS |
| `maintenance_alignment_balance_production.json` | maintenance_alignment_balance | DIY inspect; shop machines |
| `maintenance_suspension_struts_production.json` | maintenance_suspension_struts | Bounce test; no DIY spring compressors |
| `diagnosis_exhaust_emissions_production.json` | diagnosis_exhaust_emissions | Legal emissions; heat/CO safety |

## Phase 3 — specialty Batch 2 (5)

| File | Slug | Notes |
| --- | --- | --- |
| `maintenance_fuel_injectors_production.json` | maintenance_fuel_injectors | Filter/additive; no DIY GDI rails |
| `maintenance_cooling_water_pump_production.json` | maintenance_cooling_water_pump | Cold checks; hot-cap ban |
| `diagnosis_electrical_lights_sensors_production.json` | diagnosis_electrical_lights_sensors | Fuses/bulbs; SRS off-limits |
| `maintenance_body_paint_production.json` | maintenance_body_paint | Two-bucket wash; chips/rust |
| `maintenance_summer_rain_prep_production.json` | maintenance_summer_rain_prep | Heat + wet-road prep |

## Phase 3 — specialty Batch 3 final (5)

| File | Slug | Notes |
| --- | --- | --- |
| `maintenance_modified_car_production.json` | maintenance_modified_car | Mod inventory; ECU/boost = shop |
| `maintenance_towing_prep_production.json` | maintenance_towing_prep | Ratings/hitch/lights/tongue |
| `maintenance_offroad_jeep_subaru_production.json` | maintenance_offroad_jeep_subaru | Trail prep; recovery limits |
| `maintenance_classic_vintage_production.json` | maintenance_classic_vintage | Storage, ethanol, aged brakes |
| `diagnosis_insurance_post_accident_production.json` | diagnosis_insurance_post_accident | Photos, drive/no-drive, SRS ban |

**Total: 27 production playbooks** in `lib/coach-scenarios/catalog.ts`.

- Player: `components/coach/CoachScenarioPlayer.tsx`
- Integration: [`INTEGRATION.md`](./INTEGRATION.md)

### Production contract

1. Safety disclaimer every step + high-risk modal (Find a nearby shop cancel)
2. Coach encourage + progress %
3. `{{mileage}}` / `{{next_service}}` personalization
4. ≤2 buttons; GIF/video first
5. **Was this step useful?** feedback every step
