# Playwright E2E

## Setup

```bash
npm ci
npx playwright install chromium
cp .env.e2e.example .env.e2e.local   # fill E2E_EMAIL / E2E_PASSWORD
```

Export credentials (or use `dotenv` tooling):

```bash
export $(grep -v '^#' .env.e2e.local | xargs)
npm run test:e2e
```

## Commands

| Script | Purpose |
|--------|---------|
| `npm run test:e2e` | Headless Chromium |
| `npm run test:e2e:headed` | Visible browser |
| `npm run test:e2e:ui` | Playwright UI mode |

## Notes

- Without `E2E_EMAIL` / `E2E_PASSWORD`, only unauthenticated redirect specs run; others skip.
- `E2E_MOCK_AI=1` (default) mocks `/api/chat` and `/api/shop-report/generate` for stability.
- Public `/r/[token]` content assertion needs `E2E_MOCK_AI=0` so reports archive to Supabase.
- BLE OBD hardware, Stripe checkout, and Apple/Google OAuth are out of scope.
