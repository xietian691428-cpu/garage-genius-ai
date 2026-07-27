# Smoke test report — Garage Genius AI (non-payment)

| Field | Value |
|-------|--------|
| Date | 2026-07-24 |
| Environment | Vercel Production |
| Base URL | https://garagegenius.cloud (was https://garage-genius-ai.vercel.app) |
| Tester | Cursor browser automation |
| Scope | Coach / Chat / RAG / Vehicles / History / Admin / Library / i18n / mobile / perf |
| Out of scope | Payments, quotas, trial expiry, Portal, refunds |

**QA note:** QA Unlock ON → Free limits / History preview cannot be fully validated.

**Deploy note:** `/privacy` still **404** on production (Phase‑1 legal pages not deployed yet).

Legend: **PASS** | **FAIL** | **BLOCKED** | **SKIP** | **PARTIAL**

---

## Step results

### 1. Register / Login / Onboarding
- Result: **PARTIAL**
- Notes:
  - Landing OK; `/login` shows Apple / Google / email + Create account.
  - `/app` → AuthGate redirects to `/login?next=%2Fapp` ✅
  - `/admin/login` form loads ✅
  - Full register/sign-in **not completed** in automation (password fill blocked; session not present).
- Issues: I-01, I-02, I-03

### 2. Vehicle profile + playbook injection
- Result: **BLOCKED** — needs signed-in session

### 3. Coach Library → playbook walkthrough
- Result: **BLOCKED** — needs signed-in session

### 4. History (Free preview)
- Result: **BLOCKED** — needs session; under QA would show full access anyway (**SKIP** meaningful Free check)

### 5. Admin (Token Usage + Revenue)
- Result: **PARTIAL** — login page OK; dashboards not entered

### 6. i18n (en-US ↔ es)
- Result: **BLOCKED** — Settings is auth-gated

### 7. Mobile adaptation
- Result: **PASS**
- Notes: Emulated 390×844; login card stacks cleanly; no obvious overflow on login.

### 8. Performance (landing sample)
- Result: **PASS**
- Notes: `responseStart` ~775ms, DCL ~1.4s, `load` ~2.1s (one cold sample).

---

## Issue list

| ID | Severity | Step | Description | Repro | Suggested fix |
|----|----------|------|-------------|-------|---------------|
| I-01 | High | deploy | `/privacy` (and likely `/terms`) **404** | Open `/privacy` | Commit + redeploy Phase‑1 pages |
| I-02 | Medium | 1 | Login still “Privacy overview” → home `/` | Login footer | Redeploy AuthForm links |
| I-03 | Blocker for steps 2–6 | 1 | No auth session in automation browser | `/app` → login | **You sign in** in the Cursor browser tab, then reply「继续」 |
| I-04 | Process | 4 | Free History preview untestable with QA ON | — | Later: QA off short pass |

---

## Summary

- Pass: mobile viewport, landing perf sample
- Partial: login UI, admin login UI, AuthGate redirect
- Fail: production missing `/privacy`
- Blocked: Coach / Chat / vehicles / History / i18n / Admin dashboards (auth)

**Next:** Please **Take Control** of the browser → open  
https://garagegenius.cloud/login?next=/app  
→ sign in (QA OK) → stay on `/app` → reply **继续**.  
Then we resume steps 2–3–5–6–8.
