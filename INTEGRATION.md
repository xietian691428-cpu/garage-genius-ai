# Garage Genius AI — Integration Guide

Final integration map for Supabase + Stripe + CoachScenarioPlayer.  
**Runtime playbooks = `*_production.json` only** (27 guides). Legacy `*_final` / `*_optimized` files on disk are not loaded.

---

## 1. Architecture (mounted modules)

```
app/layout.tsx
  └─ I18nProvider (en-US | es)
       └─ /app  →  GarageAppPage (AuthGate)
            ├─ OnboardingFlow          (empty garage)
            ├─ Dashboard               (?tab=dashboard)
            ├─ ChatApp                 (?tab=chat)
            ├─ CoachLibrary            (?tab=coach)
            │    └─ CoachScenarioPlayer  ← COACH_PRODUCTION_PLAYBOOKS
            ├─ MaintenanceHistory      (?tab=history)  [soft paywall]
            ├─ PartsInventory          (?tab=parts)
            └─ SettingsPanel           (?tab=settings) ← LocaleSwitcher

/admin/*  →  requireAdmin() cookie session (运营 PC 后台)
  ├─ /admin                    → 数据面板 OpsHomeDashboard → GET /api/admin/ops-overview
  ├─ /admin/business/*         → Coach 反馈 / 对话 → GET /api/admin/business
  ├─ /admin/customers/*        → CRM → GET|PATCH /api/admin/customers
  ├─ /admin/ops                → 漏斗 + 成本对比 → GET /api/admin/ops-funnel
  ├─ /admin/ops/tokens         → TokenUsageDashboard → GET /api/admin/token-stats
  ├─ /admin/ops/revenue        → RevenueDashboard → GET /api/admin/revenue-stats
  ├─ /admin/ops/refunds        → SupportRefundsDashboard
  ├─ /admin/knowledge*         → 知识库 / 扩充 / 对比测试
  └─ /admin/staff*             → 后台账号 + 审计 → GET /api/admin/staff
  （旧路径 /admin/token-usage|revenue|support-refunds 会 redirect）

Stripe webhook  →  /api/stripe/webhook  →  profiles + stripe_subscriptions + revenue events
Coach quota     →  /api/coach/playbook-session
Coach feedback  →  /api/coach/feedback  →  coach_step_feedback
```

Source of truth for mounts: [`lib/bootstrap/app-modules.ts`](lib/bootstrap/app-modules.ts)  
Garage shell: [`app/app/page.tsx`](app/app/page.tsx) (imports bootstrap assert on load; tabs driven by `?tab=`)

### App mount snippet (already wired)

```ts
// lib/bootstrap/app-modules.ts — registry + assertCoachProductionReady()
// app/app/page.tsx — on module load:
try {
  logAppModuleMount(assertCoachProductionReady()); // 27 playbooks + safety rails
} catch (err) {
  console.error(err);
}
// Tabs: dashboard | chat | coach | history | parts | settings
// Coach: CoachLibrary → CoachScenarioPlayer(COACH_PRODUCTION_PLAYBOOKS)
```

---

## 2. Coach production playbooks (27)

| Layer | Path / symbol |
|-------|----------------|
| JSON corpus | `content/coach-scenarios/*_production.json` |
| Catalog | `lib/coach-scenarios/catalog.ts` → `COACH_PRODUCTION_PLAYBOOKS`, `listCoachPlaybooks`, `getCoachPlaybook`, `listRecommendedCoachPlaybooks` |
| Library UI | `components/coach/CoachLibrary.tsx` |
| Player | `components/coach/CoachScenarioPlayer.tsx` |
| Bootstrap assert | `assertCoachProductionReady()` |

**Safety (mandatory):** every production scenario ships with:

- `ux_rules.require_safety_disclaimer_every_step`
- `ux_rules.enforce_risk_confirm_modal`
- Per-step `safety_disclaimer`
- High-risk steps: `risk_confirm.required` → modal + checkbox; **Cancel** → Find a nearby shop (`onOpenShop`)

Do **not** remove risk/disclaimer gates when editing JSON.

**Media:** step visuals reference `/coach/...`. Place assets under `public/coach/` (see `public/coach/README.md`). Missing files fall back to a Shield placeholder — player still works.

---

## 3. Vehicle profile → playbook injection

| Step | Implementation |
|------|----------------|
| Onboarding | `OnboardingFlow` — mileage + market + YMM + Pro custom tags |
| Tags UI | `VehicleProfileTags` (`Modified`, `Tow`, `Classic`, `EV`, `Daily Driver`) — Pro `customProfileTags` |
| Persist | `useVehicles` / Supabase `user_vehicles` |
| Context | `toCoachVehicleContext(vehicle)` → mileage, tags, powertrain |
| Recommend | `listRecommendedCoachPlaybooks(currentVehicle, { limit: 5 })` in Coach Library + annual report PDF |

Free users see locked tags (upgrade modal `reason=tags`); system tags like `VCdb matched` still apply.

---

## 4. Step feedback loop

| Piece | Detail |
|-------|--------|
| UI | `CoachStepFeedback` after each step when `ux_rules.show_step_feedback !== false` |
| API | `POST /api/coach/feedback` |
| Payload | `scenario_slug`, `scenario_id`, `step_id`, `vote` (`yes`\|`no`), optional mileage/make/model/note/`client_session_id` |
| DB | `supabase/migrations/020_coach_step_feedback.sql` → `coach_step_feedback` |
| Behavior | Fail-open `{ ok: true, stored: false }` if auth/table missing — coach UX never blocks |

---

## 5. Free / Pro paywall

| Rule | Detail |
|------|--------|
| Free playbooks | **5 starts / 30 days** from `profiles.created_at` (`lib/playbook-limits.ts`) |
| Consume | `POST /api/coach/playbook-session` → `402` + `code: playbook_limit` |
| Usage table | `coach_playbook_usage` (`023_stripe_subscriptions_revenue.sql`) |
| Upgrade UX | `UpgradeModal` + `lib/upgrade-copy.ts` — annual CTA, cancel anytime |
| Soft middleware | `middleware.ts` — Free `?tab=history` → `/pricing?from=history` |
| Hard gates | API: playbook quota; `requireProUser` / `requireEntitlement` in `lib/subscription-guard.ts` |
| Cookie | Client writes `gg_plan` via `useSubscription` |

Pro entitlements include: unlimited playbooks, `annualHealthReport`, `customProfileTags`, `maintenanceHistory`, voice.

---

## 6. Ops admin console (PC)

一级菜单见 `lib/admin-nav.ts`：主页 / 业务管理 / 运营管理 / AI 知识库 / 客户管理 / 用户管理。

| Module | Page | API / logic |
|--------|------|-------------|
| 数据面板 | `/admin` | `GET /api/admin/ops-overview` → `lib/admin-ops-stats.ts` |
| 业务 · Playbook | `/admin/business/playbooks` | `GET /api/admin/business?view=playbooks` |
| 业务 · 对话 | `/admin/business/chats` | `GET /api/admin/business?view=chats\|thread` |
| 客户 | `/admin/customers` | `GET\|PATCH /api/admin/customers` + `customer_crm` |
| 运营总览 | `/admin/ops` | `GET /api/admin/ops-funnel` |
| Token | `/admin/ops/tokens` | `GET /api/admin/token-stats` |
| 收入 | `/admin/ops/revenue` | `GET /api/admin/revenue-stats` |
| Staff / 审计 | `/admin/staff` | `GET /api/admin/staff` + migration `025` |
| **飞轮审核** | `/admin/knowledge/flywheel` | `GET\|PATCH /api/admin/flywheel` + migration `026` |
| 飞轮入队 cron | `/api/cron/flywheel-enqueue` | Bearer `CRON_SECRET`；日扫 Coach「踩」 |

Auth: `requireAdmin()` / cookie `gg_admin_session` — `ADMIN_EMAIL` + `ADMIN_PASSWORD_B64`.  
Charts: Recharts. Types: `lib/types/admin-ops.ts`.

**飞轮闭环（最小自动挡）：** Coach `vote=no` → `flywheel_review_queue` → 人工填正确问答 →「采纳为知识库」写入 `golden_qa` + `knowledge_base`（可选 embedding）→ 下次 RAG 生效；月度 `npm run train:golden` → `finetune.py`。Chat 侧写 `rag_retrieval_events`（命中 id/title，非全文）。

---

## 7. Revenue admin

| Piece | Path |
|-------|------|
| Page | `/admin/ops/revenue` (legacy `/admin/revenue` redirects) |
| API | `GET /api/admin/revenue-stats` |
| Tables | `stripe_subscriptions`, `stripe_revenue_events` (migration `023`) |
| Sync | Stripe webhook `app/api/stripe/webhook/route.ts` mirrors subs + `invoice.paid` |

---

## 8. i18n (en-US + es)

| Piece | Path |
|-------|------|
| Init | `lib/i18n/index.ts` — `APP_LOCALES`, `initI18n`, `setAppLocale` |
| Provider | `components/i18n/I18nProvider.tsx` in root `app/layout.tsx` |
| Switcher | Settings → `LocaleSwitcher` |
| Dictionaries | `locales/en-US/common.json`, `locales/es/common.json` |

**Scope:** chrome / onboarding / coach library / feedback UI.  
**Playbook step copy** remains English (safety-critical DIY instructions).

---

## 9. Billing (Stripe)

| Flow | Route / helper |
|------|----------------|
| Checkout | `startCheckout` → `POST /api/stripe/checkout` |
| Portal | `openBillingPortal` → `POST /api/stripe/portal` |
| Webhook | `POST /api/stripe/webhook` |
| Prices | `lib/stripe-prices.ts` — env `STRIPE_PRICE_PRO_*` / `HEAVY_*` |
| Entitlements | `lib/types/subscription.ts` → `PLAN_ENTITLEMENTS` |

---

## 10. Required Supabase migrations (Coach + paywall + admin)

Apply in order through at least:

- `020_coach_step_feedback.sql`
- `022_token_usage_events.sql` (if present)
- `023_stripe_subscriptions_revenue.sql` (`coach_playbook_usage`, Stripe mirror tables)
- `025_admin_ops_console.sql` (`admin_staff`, `admin_audit_logs`, `customer_crm`)
- `026_data_flywheel.sql` (`flywheel_review_queue`, `golden_qa`, `rag_retrieval_events`)

Without `020`/`023`, feedback/quota/revenue **degrade** (fail-open or empty dashboards).  
Without `025`, CRM tags/notes/archive and staff/audit tables are empty or error until applied.  
Without `026`, flywheel enqueue/promote no-ops until migration is applied.
- `027_diy_skill.sql` (`profiles.diy_skill*`, `skill_assessment_config`, reminder uniqueness by reason)

### DIY skill band

| Piece | Path |
|-------|------|
| Types / prompt prefixes | `lib/diy-skill.ts` |
| Inference | `lib/skill-inference.ts` |
| API | `GET\|PATCH /api/diy-skill` |
| Weekly cron | `POST /api/cron/adjust-skill` |
| UI | Onboarding step + Settings → DIY coaching level |

**v1 lever = system prompt tone + soft RAG re-rank.** Do not hard-filter knowledge by skill (corpus has no skill taxonomy).

---

## 11. Smoke checks (local)

```bash
npx tsc --noEmit
npm run lint
npm run build

# Optional: assert catalog in Node
node --import tsx -e "import { assertCoachProductionReady } from './lib/bootstrap/app-modules.ts'; console.log(assertCoachProductionReady())"
```

Manual:

1. Empty garage → Onboarding → vehicle appears → Coach “Recommended”
2. Free: start 5 playbooks → 6th → UpgradeModal
3. Step Yes/No → Network `POST /api/coach/feedback` `stored: true` (after migration)
4. Settings locale → es labels
5. Admin login → `/admin` 数据面板 + `/admin/business/playbooks` + `/admin/customers`
6. High-risk step → risk modal; Cancel → shop prompt

---

## 13. Subscription Support Coach (billing)

| Piece | Path |
|-------|------|
| Hub UI | `components/subscription/SubscriptionAIAssistant.tsx` (Settings → Billing help) |
| Player | `components/subscription/SubscriptionSupportCoach.tsx` |
| Playbooks | `lib/subscription-support/catalog.ts` (5 scenarios) |
| Stripe helpers | `lib/stripe-support.ts` |
| APIs | `/api/stripe/support/{status,portal,invoice-resend,refund-request}` |
| Admin queue | `/admin/support-refunds` → Approve calls `stripe.refunds.create` |

**Safety:** refunds never auto-execute from the coach; email secondary verify + risk modal; human approval required.

## 12. Security notes

- Never set `NEXT_PUBLIC_QA_UNLOCK` / `QA_UNLOCK` in production.
- Admin password: prefer `ADMIN_PASSWORD_B64`.
- Webhook: verify Stripe signature with `STRIPE_WEBHOOK_SECRET`.
- Coach content is guidance only — keep disclaimers and `risk_confirm` on all high-risk steps.
- Billing refunds: only `/api/admin/support-refunds` approve path may call `stripe.refunds.create`.
