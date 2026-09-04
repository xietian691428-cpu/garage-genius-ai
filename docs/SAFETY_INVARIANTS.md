# Safety invariants

These are product rules, not settings. Owners can dismiss the general Chat disclaimer banner; they cannot turn the items below off. CoachScenarioPlayer’s step engine is not a place to weaken them. Auto.dev / paid TSB is not connected.

## Always on

1. **High-risk callouts.** Matched lifting / brakes / SRS / EV / CO topics always show. `lib/safety-topics.ts`.
2. **Exit-under wins.** If focus or `[CRITICAL STATE]` says the vehicle is already raised, an assistant reply that tells the owner to stay under / continue under (unnegated) is repaired on the same W1 path (`needsExitUnderRepair` → `formatExitUnderRepairPrompt`). Raised + brakes/PB also requires the phrase `get clear from under`.
3. **No invented specs without an anchor.** No garage-saved oil figure, affiliate OEM, or official `[VEHICLE_ANCHOR]` / `[EPA_MPG]` / `[DIY_PATH]` → `applySpecOutputGate` strips qt/L, ft-lb/N·m, “0W-xx required”, unaffiliated OEM tokens.
4. **NHTSA recalls are US-only.** EU/GB get regional education, never a NHTSA campaign list as local recalls. YMM list ≠ this VIN’s open/closed status.
5. **Hard cap before the model.** `AI_COST_HARD_CAP` defaults ON (unset = ON). `ai_budget_exceeded` (402) and `vision_quota_exceeded` (429) do not emit a silent short coach reply.
6. **Vehicle bind.** Chat and Shop Report require a garage `vehicle_id` the signed-in user owns. Header ≠ request is 409. Wrong id is 403. Switching vehicles loads that car’s thread only; a polluted older thread is not auto-wiped — for an important question (recalls, oil spec), start a new topic after the switch.
7. **Vision low trust.** Blurry / dark / unreadable / confidence below 0.5 drops readings and DTCs before Chat injection.
8. **No live OBD theater.** `has_obd_adapter=false` must not claim live/realtime adapter data. Pasted codes are user-provided.
9. **Diagnostic / report tone.** No unnegated “Replace X now” / “It’s definitely” / “Must be the…” in Chat or Shop Report.

## Freeze

Changing `lib/safety-topics.ts`, `lib/spec-discipline.ts`, `lib/chat-vehicle-gate.ts`, or `lib/pilot/safety-observe-phrases.ts` requires the matching Vitest files in [tests/README.md](../tests/README.md).

## Observe (no PII)

Production logs: grep `[safety-observe]`. Event names only (`drift_reset`, `spec_block`, `vision_reject`, `recall_degraded`, `ai_budget_exceeded`, `vision_quota_exceeded`, `exit_under_repair`). Optional `userHash` (sha256 prefix), never full VIN, never base64, never prompt bodies.

Admin Token Usage can count `token_usage_events.metadata.safetyEvents` when rows exist.

## Residual gaps

See [RESIDUAL_RISKS.md](./RESIDUAL_RISKS.md). Known holes (unstated raised premise, wrong garage-saved quarts, YMM≠VIN recalls) are not licenses to skip the invariants above.
