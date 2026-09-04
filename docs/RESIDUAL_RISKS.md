# Residual risks

Living list of known product gaps after each safety/cost wave. Keep entries short. Do not treat this as a license to skip Vitest or callouts.

## W1 — Gates, multi-turn drift, safety callouts

**Raised premise not stated.** If the owner never says the vehicle is already on jack stands / raised, Chat cannot force exit-under from history alone. Ask a generic stability premise (level ground, chocked, rated stands, never jack-only) before under-car steps.

**Header vs request.** `/api/chat` now 403s if `vehicle_id` is not in the signed-in garage and 409s if `selectedVehicleId` ≠ request `currentVehicle.id`. Older clients that omit `selectedVehicleId` still get ownership bind from the request id.

**vPIC vs garage YMM.** Conflict inject (`[VEHICLE_CONFLICT]`) and the garage warning require a saved vPIC snapshot. Hand-fill after decode failure is `[YMM_UNVERIFIED]`, not a snapshot mismatch.

**Exit-under.** Production repair uses the same `get clear from under` / stay-under phrases as CI fixtures. Repair is a second DeepSeek pass; if that pass fails, the first draft may still miss get-clear (observe-only fallback).

## W2 — Spec gate, diagnostic tone, DTC catalog

**Wrong anchors still yield wrong specs.** Garage-saved oil viscosity/capacity, affiliate OEM numbers, and any figure already in an official block can be quoted with a source. If that saved/curated value is wrong for the engine, Chat can still repeat it. Confirm on the fill cap / owner's manual / dealer EPC.

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

**Observe is not a second safety gate.** `[safety-observe]` / `metadata.safetyEvents` are counts. Blocking still happens in Chat gates, spec rewrite, and `needsExitUnderRepair`.

**Stay-under contradiction uses the W1 repair prompt.** Raised-only (no brake/PB CRITICAL) now also rewrites unnegated stay-under / continue-under. It does not invent a second phrase list.

Regression pack: [tests/README.md](../tests/README.md). Invariants: [SAFETY_INVARIANTS.md](./SAFETY_INVARIANTS.md).
