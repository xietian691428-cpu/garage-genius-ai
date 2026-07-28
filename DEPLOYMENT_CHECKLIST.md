# Garage Genius AI — Deployment & launch checklist

Last updated: July 24, 2026  
Scope: **27 production Coach playbooks** + core Free/Pro product.  
Migrations **001–024**: assumed applied (including playbook usage + Stripe revenue + support refunds).

---

## Progress snapshot

| Phase | Step | Status |
|-------|------|--------|
| 1 | 1 Privacy `/privacy` + Terms `/terms` + links | **Done (code)** |
| 1 | 2 Checkout skips stacked `trial_period_days` | **Done (code)** |
| 1 | 3 History Free read-only preview (no soft redirect) | **Done (code)** |
| 1 | 4 `.env.example` production required vars | **Done (code)** |
| 2 | 5 Production env (Stripe live, DeepSeek, Admin) | **You — configure host** |
| 2 | 6 Stripe webhook → profiles / subscriptions | **You — smoke** |
| 2 | 7 Full smoke (register → quota → upgrade → cancel → billing help) | **You — smoke** |
| 3 | 8 Capacitor iOS/Android | **Scaffolded** → `docs/STORE_LAUNCH.md` |
| 3 | 9 IAP / Stripe hybrid | **Policy + Stripe blocked on native**; IAP TBD |
| 3 | 10 Store listing assets | **Copy templates in STORE_LAUNCH** — screenshots TBD |

---

## A. Pre-deploy code health

- [x] Phase 1 code fixes landed (privacy/terms, checkout trial, history preview, `.env.example`)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` clean (or only acknowledged warnings)
- [ ] `npm run build` succeeds on the deploy target (Node version matches Vercel)
- [ ] `assertCoachProductionReady()` → **27** playbooks, safety UX rules present
- [ ] `NEXT_PUBLIC_QA_UNLOCK` / `QA_UNLOCK` **unset** in production (code also hard-blocks when `VERCEL_ENV=production`)
- [ ] OAuth buttons only when `NEXT_PUBLIC_AUTH_APPLE` / `NEXT_PUBLIC_AUTH_GOOGLE` enabled after Supabase providers are live
- [ ] Secrets not committed (`.env.local` gitignored)
- [ ] Legal pages load: `/privacy`, `/terms` (linked from login, Settings, landing footer, pricing)

---

## B. Environment variables (Step 5)

Copy from [`.env.example`](./.env.example). **Required for production:**

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_APP_URL` | `https://garagegenius.cloud` (Stripe redirects, OAuth) |
| `NEXT_PUBLIC_SUPABASE_URL` | Auth + DB |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server seed, quota, Stripe sync, admin |
| `DEEPSEEK_API_KEY` | Chat completions |
| `STRIPE_SECRET_KEY` | `sk_live_…` in production |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `pk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` for `/api/stripe/webhook` |
| `STRIPE_PRICE_PRO_MONTHLY` / `YEARLY` | Live Price IDs |
| `STRIPE_PRICE_HEAVY_MONTHLY` / `YEARLY` | Live Price IDs |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD_B64` | `/admin/login` |

**Must stay unset in production:** `NEXT_PUBLIC_QA_UNLOCK`, `QA_UNLOCK`.

Optional: VAPID + `CRON_SECRET` + Resend (reminders), Amazon associate tag.

Checklist:

- [ ] All required vars set on Vercel (or host) **Production** environment
- [ ] Stripe keys/prices are **live** mode for prod (test mode only on staging)
- [ ] Admin login works at `/admin/login`
- [ ] Chat returns a reply (DeepSeek key valid)

---

## C. Database migrations

- [x] `001`–`024` applied (user confirmed)
- [ ] Spot-check tables exist: `profiles`, `coach_playbook_usage`, `stripe_subscriptions`, `subscription_support_requests`, `knowledge_base`
- [ ] **Production must include `030_inventory_rls_tighten.sql`**
  - Tightens `inventory_items` RLS to `auth.uid() = user_id` only (removes `user_id is null` access).
  - Verify in Supabase SQL editor:

```sql
select polname, pg_get_expr(polqual, polrelid) as using_expr
from pg_policy
join pg_class on pg_class.oid = polrelid
where relname = 'inventory_items';
```

  - Expect policies that only allow `auth.uid() = user_id` (no `user_id is null`).
  - If missing: run migration `030` (or paste its SQL) on the production project, then re-check.

---

## D. Stripe webhook & subscription sync (Step 6)

- [ ] Webhook endpoint: `https://garagegenius.cloud/api/stripe/webhook`
- [ ] Events enabled at minimum:
  - `checkout.session.completed`
  - `customer.subscription.created` / `updated` / `deleted`
  - `invoice.paid` / `invoice.payment_failed`
- [ ] Signing secret matches `STRIPE_WEBHOOK_SECRET`
- [ ] **Test (staging or live carefully):** complete Checkout → confirm:
  - `profiles.subscription_status` → paid / active (or trialing only if checkout trial granted)
  - `profiles.stripe_customer_id` + `stripe_subscription_id` set
  - `stripe_subscriptions` row upserted (migration `023`)
- [ ] Portal: Settings → Manage billing opens Customer Portal
- [ ] Checkout **does not** stack a second 14-day trial when `profiles.trial_ends_at` already set (metadata `checkout_trial=skipped`)

---

## E. Free / Pro paywall

- [ ] Free: **5** coach starts per **30-day window from registration** (`lib/playbook-limits.ts`)
- [ ] 6th start → `402` + UpgradeModal (annual CTA + cancel anytime)
- [ ] Coach Library shows remaining count + reset date
- [ ] Free `?tab=history` **opens** with read-only preview (latest 3) + upgrade CTA — **not** redirected to `/pricing`
- [ ] Pro: unlimited playbooks, annual report, custom tags, full history
- [ ] `gg_plan` cookie set after `useSubscription` resolves

---

## F. Coach UX & safety

- [ ] All 27 production guides list in Coach Library
- [ ] Recommended row personalizes from mileage / tags / powertrain
- [ ] High-risk step shows **risk_confirm** modal; Cancel offers shop path
- [ ] Every step shows **safety disclaimer**
- [ ] Step feedback POST returns `stored: true` when signed in
- [ ] Optional: populate `public/coach/**` media (otherwise Shield fallback)

---

## G. Admin dashboards

- [ ] `/admin/token-usage` loads
- [ ] `/admin/revenue` shows MRR/ARPU after paid invoice events
- [ ] `/admin/support-refunds` lists pending refund requests
- [ ] Unauthenticated `/admin/*` → login

---

## H. i18n

- [ ] Settings → **English (US)** / **Español**
- [ ] Coach chrome updates; playbook DIY body remains English (expected)

---

## I. Security (minimum)

- [ ] Service role key only on server; never `NEXT_PUBLIC_*`
- [ ] Stripe webhook signature verification enabled
- [ ] Admin session cookie: HttpOnly, Secure in production
- [ ] RLS on user tables; no public write to billing tables
- [ ] AI rate limits on (`lib/ai-abuse.ts` / migration `018`)
- [ ] `npm audit` — fix criticals before launch
- [ ] Preview deployments do not share prod webhook secret carelessly

---

## J. Full smoke test (Step 7)

Run on **staging** first, then a careful prod pass.

| # | Action | Expected |
|---|--------|----------|
| 1 | Register new email (or OAuth) | Profile `trialing` + `trial_ends_at` ≈ +14d; land in `/app` |
| 2 | Open Privacy / Terms from login & Settings | Pages render; links work |
| 3 | Start 5 distinct coach playbooks | Allowed; remaining count decreases |
| 4 | Start 6th playbook | Blocked `402` / UpgradeModal |
| 5 | Open History as Free | Preview (≤3) + upgrade CTA; no forced `/pricing` redirect |
| 6 | Upgrade via Checkout (test or live) | Success → `/app?billing=success`; profile paid; **no second trial** if signup trial existed |
| 7 | Webhook delivery | Stripe Dashboard → 2xx; DB rows updated |
| 8 | Settings → Manage billing → cancel | Portal cancel works; status updates on period end / webhook |
| 9 | Settings → Billing help coach | 5 scenarios; portal deep-links; invoice list |
| 10 | Refund request | Email verify + risk confirm → `pending_human` only |
| 11 | Admin approve/reject refund | Approve → Stripe refund; Reject → no chargeback |

- [ ] Staging smoke signed off
- [ ] Production smoke signed off (or deferred with owner risk acceptance)

---

## K. Knowledge / RAG (ops)

- [ ] Knowledge seeded (VCDB / owner-reviews / autodata DTC + CarRepairQA + car_fault + brands as needed)
- [ ] Optional: Admin reindex embeddings for vector half of hybrid RAG
- [ ] Spot-check chat: DTC e.g. `P0420`, Chinese repair Q if corpus used

---

## L. Subscription Support Coach

- [x] Migration `024_subscription_support_requests.sql` applied
- [ ] Settings → **Billing help coach** opens 5 scenarios
- [ ] Portal deep-links: payment method + cancel
- [ ] Invoice list / hosted PDF works
- [ ] Refund → `pending_human`; Admin Approve executes Stripe refund
- [ ] QA unlock disables Stripe support APIs (503) — confirm QA is **off** in prod

---

## M. App Store / Play (Steps 8–10) — last

See **[docs/STORE_LAUNCH.md](./docs/STORE_LAUNCH.md)**.

- [ ] Capacitor (or equivalent) iOS + Android projects
- [ ] IAP / Stripe hybrid policy implemented for native builds
- [ ] Privacy + Terms URLs in store consoles
- [ ] Screenshots, descriptions, data-safety labels
- [ ] Sign in with Apple / Google configured for store builds
- [ ] Reviewer demo account

**Do not submit** until Web Phase 2 smoke is green and IAP strategy is decided.

---

## N. Rollback notes

- Feature flags: keep `QA_UNLOCK` off; use Stripe test mode on staging only
- If webhook misconfigured: pause Checkout; fix secret; replay events from Stripe Dashboard
- Bad migration: restore DB backup before re-applying

---

## Sign-off

| Role | Name | Date | Notes |
|------|------|------|-------|
| Eng / owner | | | Phase 1 code |
| Eng / owner | | | Phase 2 smoke |
| Eng / owner | | | Phase 3 store |

**Web launch gate:** A–J (required) + L green.  
**Store launch gate:** Web gate + M green.
