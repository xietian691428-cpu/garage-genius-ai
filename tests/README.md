# Permanent regression pack (W1–W6)

CI: `npm test` (`vitest run`). Safety-seed subset: `npm run test:safety-seeds`.
Playwright smoke exists (`e2e/p1-smoke.spec.ts`, `e2e/chat-shop-report.spec.ts`) — not required for this pack.

**Freeze:** changes to `lib/safety-topics.ts`, `lib/spec-discipline.ts`, `lib/chat-vehicle-gate.ts`, or `lib/pilot/safety-observe-phrases.ts` must keep the rows below green.

| ID | Scene | Vitest |
| --- | --- | --- |
| S1 | 串戏 / 车底 / exit-under | `tests/chat-intent-drift.test.ts`, `tests/us-top10-safety-seeds.test.ts`, `tests/safety-topics.test.ts`, `tests/deepseek-trim.test.ts`, `tests/fixtures/exit-under.ts` |
| S2 | P0420 / diagnostic tone / local DTC | `tests/diagnostic-tone.test.ts`, `tests/dtc-chips.test.ts`, `tests/dtc-catalog.test.ts`, `tests/spec-discipline.test.ts` |
| S3 | US/EU recalls (NHTSA tri-state) | `tests/vehicle-data.test.ts`, `tests/shop-report-logic.test.ts` |
| S4 | 无锚点规格闸 | `tests/spec-discipline.test.ts`, `tests/spec-gap-intent.test.ts` |
| S5 | 切车 / 错车 / 所有权 | `tests/chat-vehicle-gate.test.ts`, `tests/chat-vehicle-ownership.test.ts`, `tests/garage-vehicle-match.test.ts` |
| S6 | 模糊图 / 低置信 mock | `tests/vision-analysis.test.ts` |
| S7 | 保险句 | `tests/insurance-safety.test.ts` |
| S8 | 禁驶 / 拖车 | `tests/drive-safety.test.ts` |
| S9 | 402 / 429 配额门禁 | `tests/ai-cost.test.ts`, `tests/boundary-gates.test.ts`, `tests/token-entitlements.test.ts` |
| S10 | 无 OBD 不假装 live | `tests/obd-preference.test.ts`, `tests/dtc-chips.test.ts` |
| S11 | Shop Report 禁语 + 绑车 | `tests/shop-report-logic.test.ts` |
| W5 | Guide↔Chat 同锚点 | `tests/coach-guide-chat.test.ts` |
| W6 | raised + stay-under 矛盾; observe 无 VIN | `tests/safety-topics.test.ts`, `tests/safety-observe-events.test.ts` |
| Funnel | US 高频码 chips / 空车库文案 | `tests/us-completion-funnel.test.ts`, `tests/chat-repair-loop.test.ts` |

Invariants: `docs/SAFETY_INVARIANTS.md`. Residual gaps: `docs/RESIDUAL_RISKS.md`. QA vs paid quotas: `docs/INTERNAL_TEST_QUOTAS.md`.
