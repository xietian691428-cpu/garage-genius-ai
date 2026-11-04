# Safety invariants

These are product rules, not settings. Owners can dismiss the general Chat disclaimer banner; they cannot turn the items below off. CoachScenarioPlayer’s step engine is not a place to weaken them. Auto.dev / paid TSB is not connected.

## Always on

1. **High-risk callouts.** Matched lifting / brakes / SRS / EV / CO topics always show. `lib/safety-topics.ts`.
2. **Exit-under wins.** If focus or `[CRITICAL STATE]` says the vehicle is already raised, an assistant reply that tells the owner to stay under / continue under (unnegated) is repaired on the same W1 path (`needsExitUnderRepair` → `formatExitUnderRepairPrompt`). Raised + brakes/PB also requires the phrase `get clear from under`.
3. **No invented specs without an anchor.** No garage-saved oil figure, affiliate OEM, or official `[VEHICLE_ANCHOR]` / `[EPA_MPG]` / `[DIY_PATH]` → `applySpecOutputGate` strips qt/L, ft-lb/N·m, “0W-xx required”, unaffiliated OEM tokens.
4. **NHTSA recalls are US-only.** EU/GB get regional education, never a NHTSA campaign list as local recalls. YMM list ≠ this VIN’s open/closed status.
5. **Hard cap before the model.** `AI_COST_HARD_CAP` defaults ON (unset = ON). `ai_budget_exceeded` (402) and `vision_quota_exceeded` (429) do not emit a silent short coach reply.
6. **Vehicle bind + switch isolation + authoritative history.** Chat and Shop Report require a garage `vehicle_id` the signed-in user owns. Header ≠ request is 409. Wrong id is 403. **History is server-authoritative:** `/api/chat` requires `message` (this turn only); client `messages[]` is ignored for the model (debug compare only). History is loaded from `chat_threads` / `chat_messages` with `user_id` + `vehicle_id` + `thread_id` on every SELECT/INSERT — **history boundary = `thread_id`**. Wrong-user or cross-vehicle `threadId` → **403**. **Cross user/vehicle/thread = zero-carry.** Same vehicle may have multiple open threads (**New topic**); each has its own messages and focus (`vehicle_id` + `thread_id`). Vehicle switch drops the previous car’s `threadId` and resumes the **target vehicle’s default/latest** thread — never another car’s. Same-car follow-ups continue the current thread until New topic. Spoken mix of two cars in one bubble still needs `[VEHICLE_ANCHOR]` / `[SPOKEN_VEHICLE_CONFLICT]` clarification. Full VIN never enters the prompt/logs.
6b. **Private owner’s manuals (user × vehicle).** Uploaded PDFs live in `vehicle_manuals` / `vehicle_manual_chunks` with mandatory `user_id` + `vehicle_id`. They must **never** enter global `knowledge_base` / shared RAG. Retrieval is filtered to the signed-in user and the selected vehicle only (intent query + heading rerank). Manual text is REPORTED evidence (`[USER_MANUAL]`) and ranks **below** safety stop-rules / exit-under / drive-safety / unsafe OBD. Same-frame order: **safety > OBD unsafe/live `[OBD_STATE]` > `[USER_MANUAL]` > `[GARAGE_PROFILE_FLUIDS]` (owner-confirmed only) > model**. YMM mismatch requires explicit owner confirm before injection. Cite as “Your manual” or “Garage profile (from your manual)”. Heuristic oil / coolant / brake fluid / **ATF/CVT** extracts stay in `vehicle_manual_extract_candidates` (`kind=oil|coolant|brake_fluid|atf`) until the owner confirms — never silent garage writes. ATF/CVT uses `transmission_kind` (`atf|cvt|unknown`) on the same kind=atf path (no separate kind=cvt). Spec text stays verbatim; CVT must be labeled CVT-specific and must **never** recommend substituting Dexron/Mercon/conventional ATF. ATF/CVT candidates never write `oil_*`. Replacing the PDF supersedes old candidates and clears `user_manual_confirmed` fluid fields (including ATF + `transmission_kind`). Manual pages do **not** authorize opening a hot coolant reservoir, do **not** teach brake bleeding / opening hydraulic lines, do **not** invent ATF/CVT drain-and-fill DIY or absolute “lifetime never change” / “replace ATF now” claims, and do **not** skip lighting structure confirm. Overheat / steam and soft pedal / brake warning → stop-drive education outranks any fluid excerpt.
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
