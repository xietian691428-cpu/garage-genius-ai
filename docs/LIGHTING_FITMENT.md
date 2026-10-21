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

## Residual risks

See [RESIDUAL_RISKS.md](./RESIDUAL_RISKS.md) W7 / W8.
