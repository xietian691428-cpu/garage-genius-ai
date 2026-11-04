# Residual risks

Living list of known product gaps after each safety/cost wave. Keep entries short. Do not treat this as a license to skip Vitest or callouts.

## W1 — Gates, multi-turn drift, safety callouts

**Raised premise not stated.** If the owner never says the vehicle is already on jack stands / raised, Chat cannot force exit-under from history alone. Ask a generic stability premise (level ground, chocked, rated stands, never jack-only) before under-car steps.

**Header vs request.** `/api/chat` 403s if `vehicle_id` is not in the signed-in garage and 409s if `selectedVehicleId` ≠ request `currentVehicle.id`. Older clients that omit `selectedVehicleId` still get ownership bind from the request id.

**Vehicle switch = cross-vehicle history zero-carry; same-car multi-thread = explicit New topic.** Client sends only `message` + `threadId` + `vehicleId` (no model transcript). Server persists the user turn, then loads **that** `thread_id` from DB for DeepSeek; `messages[]` is ignored. Cross-user / cross-vehicle `threadId` → 403. Switch flags omit the previous car’s `threadId` and resume the target vehicle’s default/latest open thread. **New topic** creates an empty sibling thread on the same vehicle (no inherited messages/focus). Same-car follow-ups continue the current thread (proves history is not wiped every turn). Requires migration `055_chat_threads_authority.sql`. **Residual:** if the owner mixes two jobs in one thread without tapping New topic, weak follow-up / drift still applies — New topic is the explicit optimal boundary. Verbally mixing two cars in one bubble still needs archive + `[SPOKEN_VEHICLE_CONFLICT]`.

**Private owner’s manuals.** Migrations `056`–`060` (owner manuals + oil/coolant/brake-fluid extract). Text-layer PDF extract can miss scanned pages (OCR is P2). YMM guess from early pages is best-effort — owners can confirm a mismatch and Chat will still inject; that residual misuse is accepted after an explicit confirm. Intent FTS can miss the right page; heading boost is heuristic. **Oil / coolant / brake-fluid extract heuristics can misread** a nearby fluid line (washer, ATF, clutch, A/C refrigerant) — staging is not truth until the owner taps Save. **Coolant brand / freeze-point / exact liters** and **DOT grade** are easy to confuse across markets; owner confirm is the residual responsibility. **Confirming a wrong-version PDF** writes oil/coolant/brake fields into the garage as `user_manual_confirmed` until they replace the file or edit. Retrieved chunk figures still unlock the S4 allowlist this turn with a “Your manual” source. Manuals are never global RAG and never train third parties. **Manual coolant text never authorizes hot-cap DIY**; **manual brake DOT never authorizes bleeding or opening lines** — steam / red gauge / soft pedal stay on drive-safety / intake gates.

**vPIC vs garage YMM.** Conflict inject (`[VEHICLE_CONFLICT]`) and the garage warning require a saved vPIC snapshot. Hand-fill after decode failure is `[YMM_UNVERIFIED]`, not a snapshot mismatch.

**Exit-under.** Production repair uses the same `get clear from under` / stay-under phrases as CI fixtures. Repair is a second DeepSeek pass; if that pass fails, the first draft may still miss get-clear (observe-only fallback).

## W2 — Spec gate, diagnostic tone, DTC catalog

**Wrong anchors still yield wrong specs.** Garage-saved oil viscosity/capacity, affiliate OEM numbers, and any figure already in an official block can be quoted with a source. If that saved/curated value is wrong for the engine, Chat can still repeat it. Chat must still tell the owner to **verify on the under-hood fill cap / label** and the owner's manual.

**Lookup oil is not a Chat fact.** UI may show a curated oil line; Chat omits lookup quarts/0W-xx unless the owner saved them on the vehicle. Drain-plug torque is almost never anchored — S4 should still get a manual/cap rewrite.

**Tone rewrite is string-level.** “Replace the converter” / “It's definitely” are rewritten without a second model call. Novel certainty phrasing can still slip through.

CoachScenarioPlayer internals were not changed.

## W3 — Recall market, vision low-trust, official-data degrade

**YMM recall list ≠ per-VIN status.** NHTSA `recallsByVehicle` is year/make/model. An empty or listed result is not proof that this owner's VIN is open, closed, or unrepaired. Timeout/error must not be described as “no recalls”. Always verify with the VIN at nhtsa.gov/recalls or a dealer.

**Non-US markets have no local campaign DB here.** EU/GB get regional guidance only — never a NHTSA list presented as local recalls.

**Blurry/dark/unreadable or confidence < 0.5 photos drop readings and DTCs.** Kimi may still guess; the post-parse gate strips those fields before Chat injection. A mismatched photo (brake-pad question + OBD scene) only asks for confirmation.

**Degraded vPIC/EPA/NHTSA.** `[ANCHOR_STATUS] none/unavailable/regional` forbids “according to NHTSA there are no recalls” and invented EPA MPG. Spec gate (W2) still applies.

## W4 — Language/units, insurance, quota honesty

**Assistant replies are en/es only.** HARD LANGUAGE LOCK still *detects* Chinese in the latest user message, but the assistant must reply in English (never CJK). A post-gate strips any leaked CJK (optional one regen, then deterministic strip/fallback). Product UI, quota banners, and recall cards remain en-US with key es strings. Other UI locales can still look mixed; that chrome gap is accepted for this wave.

**Quota cap reduces capability on purpose.** When `ai_budget_exceeded` (402) or `vision_quota_exceeded` (429) fires, Chat/Kimi are not called. Remaining coaching is unavailable until next month or upgrade — not a silent “short coach” reply. Truncation still keeps CRITICAL STATE / vehicleRaised system lines; it cannot recreate facts that were never in the turn.

## W5 — OBD honesty, Guide↔Chat, Shop Report

**User-stated facts in a Shop Report can be wrong.** Codes, symptoms, mileage, and “checks done” are taken from the owner’s chat/guide text (and local DTC titles). The report is a communication aid, not verification that those facts are true. A technician still has to confirm on the vehicle.

**Guide vs Chat wording need not match word-for-word.** Both inject the same `[VEHICLE_ANCHOR]` and the same raised / parking-brake focus flags. Playbook step copy, Chat prose, and safety callouts can differ in phrasing. When they conflict, safety (raised, parking brake, high-risk callouts) wins. CoachScenarioPlayer’s step engine was not changed.

**No adapter ≠ silent live data.** `has_obd_adapter=false` still allows pasted/OCR codes labeled user-provided. A model that invents “based on live OBD readings” is rewritten, but novel live-data phrasing can slip through.

## W6 — Hardening (pack, contradiction, observe)

W1–W5 leftovers still apply. Short index:

| Residual | Wave |
| --- | --- |
| Owner never said the vehicle is already raised | W1 |
| Wrong garage-saved quarts/viscosity still quoted | W2 |
| YMM NHTSA list ≠ this VIN’s open/closed status | W3 |
| Non-en/es UI vs en/es-only assistant (CJK post-gate) | W4 |
| User-stated facts can be written into a Shop Report | W5 |
| Exit-under repair is a second DeepSeek pass; if it fails, observe-only | W1 / W6 |
| Lighting YMM ≠ VIN lighting options; weak bulb hints can still be wrong for a trim | W7 |
| Intake honesty / no paid fitment / DTC check_order ≠ TSB | W8 |
| Lighting weak table ≠ VIN config; battery/overheat intake honesty | W9 |
| Housing photo misread; brake intake is education-only (no bleed DIY) | W10 |

**Observe is not a second safety gate.** `[safety-observe]` / `metadata.safetyEvents` are counts. Blocking still happens in Chat gates, spec rewrite, and `needsExitUnderRepair`.

**Stay-under contradiction uses the W1 repair prompt.** Raised-only (no brake/PB CRITICAL) now also rewrites unnegated stay-under / continue-under. It does not invent a second phrase list.

## W7 — Exterior lighting path (headlamps)

**YMM / weak table ≠ this VIN’s lighting package.** `content/lighting/ymm-common.json` is educational coverage for common US-market rows. The same year/make/model can be halogen bulb or sealed LED by trim. Chat must confirm housing type when ambiguous; it must not claim VIN-decoded lighting options without a real fitment source.

**Allowlisted bulb hints can still be wrong for a rare package.** H11/9005-style hints always carry verify language. Unknown YMM must not invent a size. Spec gate still blocks invented OEM lamp numbers when not anchored.

**LED-in-halogen “upgrade” legality is not decided here.** Copy teaches glare and FMVSS 108 / local-rule risk. Novel “you’re fine / legal in all states” phrasing can still slip tone guards — watch regressions.

**Adaptive / matrix aim and coding are shop tools.** Guides do not teach module coding. Shop Report may note an educational lighting path; technicians still verify on the car.

Details: [LIGHTING_FITMENT.md](./LIGHTING_FITMENT.md).

## W8 — Intake slots, evidence grades, stop rules, DTC check_order

**No paid all-industry fitment API.** Housing confirm and weak YMM hints are session education only. Structure unconfirmed → `[LIGHTING_PATH]` stays `ambiguous_needs_confirm` and bulb sizes stay blocked.

**Putco AI Fitment is a brand catalog only (US/CA).** Read-only `GET /ai/fitment` may inject `[PUTCO_FITMENT]` for accessory/fitment asks. It is **not** OEM factory parts data, **not** a full aftermarket bulb library, and **not** EU/UK type approval. Timeout/empty → degrade without inventing SKUs. Never send VIN. Must not override structure-unconfirmed lighting gates.

**Intake depends on owner honesty.** Ephemeral slots are derived from the transcript (not a second DB). Wrong or incomplete answers → wrong narrowing. Prefer ≤2–3 questions over inventing causes.

**DTC `check_order` is not a TSB.** Local catalog steps are educational sequences. They do not authorize “Replace converter now” or OEM procedure claims.

**Stop rules are prompt-level.** `[STOP_RULE]` forces see-a-pro language for SRS, brake hydraulics/ABS deep work, hot cooling caps, HV orange, adaptive/matrix coding, ADAS camera-on-lamp. Complements `safety-topics` / drive-safety; not a second callout UI.

Details: [INTAKE_AND_EVIDENCE.md](./INTAKE_AND_EVIDENCE.md).

## W9 — Lighting table expansion + battery / overheat intake reuse

**Weak YMM table is not VIN-level lighting decode.** Expanded `ymm-common.json` still only covers common US-market heads. `multiConfig` rows must stay ambiguous until housing confirm. Wrong H-numbers are worse than blank rows.

**Battery / overheat intake is ephemeral and honesty-dependent.** Same derive path as lighting — no second persistence. Missing cranking pattern or steam/gauge slots → ask first; never “Replace battery now.” Steam → do-not-drive / no hot-cap (prompt + W9 output gate).

**No paid multi-brand fitment API / no matrix coding / no deep cooling teardown** in this wave. Putco (if enabled) remains a single-brand US/CA catalog tool — see Putco residual note under W8.

## W10 — Brake warning intake + housing photo assist + YMM +5–10

**Brake coaching is education-only.** Soft/spongy/sinking pedal or brake warning light → do-not-drive / tow / shop (with `DRIVE_SAFETY` + `[STOP_RULE]` / BRAKE GATE). The product does **not** teach DIY bleeding, opening caliper lines, or “drain brake fluid first.” Cold reservoir sight-glass observation and recent-work history only. “Replace master cylinder now” / “definitely the master cylinder” are tone/gate-blocked — causes stay possible.

**Housing photo assist can misread.** Kimi `housing_guess` + `housing_confidence` may label a dust cap or sealed heatsink wrongly. Only `confidence=high` with a clear guess advances ephemeral structure (still prefer a one-line owner confirm). Blurry/dark/low-confidence photos strip to unclear and never emit H11/OEM from the image. Photo alone must not skip multiConfig confirm or invent a bulb size.

**Weak YMM rows added in W10** (Tacoma, Highlander, Pilot, HR-V, Escape, Explorer, Equinox, Malibu, Sierra, Sportage, Forte, CX-5, Tiguan) remain allowlisted hints after confirm — not VIN decode. Sierra vs Silverado packages can diverge.

Regression pack: [tests/README.md](../tests/README.md). Invariants: [SAFETY_INVARIANTS.md](./SAFETY_INVARIANTS.md).
