# Google Play Billing

Android Capacitor shell sells four auto-renewing subscriptions through Google Play. The server verifies each purchase with the Google Play Developer API, then writes the same `profiles.subscription_status` used by Apple In-App Purchase and Stripe. The iOS StoreKit flow is unchanged.

This code is ready to ship with the next Play `versionCode`. Creating the subscriptions, the service account, and a license-tester account is still a Play Console task. Real-time developer notifications are not implemented yet.

## Product IDs

Package name: `com.garagegenius.ai` (`GOOGLE_PLAY_PACKAGE_NAME`).

| Play subscription ID | Base plan ID | Plan | USD price in Play Console |
| --- | --- | --- | --- |
| `com.garagegenius.ai.pro.monthly` | `monthly` | `pro` | **$9.99 / month** |
| `com.garagegenius.ai.pro.yearly` | `yearly` | `pro` | **$79 / year** |
| `com.garagegenius.ai.heavy.monthly` | `monthly` | `pro_heavy` | **$19.99 / month** |
| `com.garagegenius.ai.heavy.yearly` | `yearly` | `pro_heavy` | **$159 / year** |

Set the base-plan price to that USD amount. These are the same list prices as the website and Apple catalog (`PLAN_ENTITLEMENTS` in `lib/types/subscription.ts`). The app shows the localized Play price after Google returns it; the fallback label is the amount above. Do not price Android lower or higher than the other stores.

`pro` matches Apple Pro. `heavy.*` maps to `pro_heavy` (Pro Heavy). Source on the winning profile row is `billing_provider = google_play`.

Override IDs only if Play Console already uses different ones. Set both `GOOGLE_PLAY_*` and `NEXT_PUBLIC_GOOGLE_PLAY_*` so the shell and the server agree. Base plan overrides: `NEXT_PUBLIC_GOOGLE_PLAY_BASE_PLAN_MONTHLY` / `_YEARLY`.

## What the app does

1. Signed-in user opens Pricing, Settings, or an upgrade modal.
2. Android loads localized prices with `@capgo/native-purchases` (`getProducts`).
3. Subscribe calls `purchaseProduct` (subscription + base plan).
4. The client posts `{ purchaseToken, productId, packageName, orderId? }` to `POST /api/google/play/verify` with the Supabase bearer token.
5. The UI refreshes from `profiles`. A client purchase success does not grant membership by itself.
6. Restore queries existing Play subscriptions and verifies each token.
7. Manage subscription opens Play subscription management (`NativePurchases.manageSubscriptions`, or the Play subscriptions page). It does not open Stripe or the website checkout.

Web and iOS keep their existing paths. Android still hides Stripe Checkout, token packs, and “buy on the website” links.

Canceled, already-owned, and Billing-unavailable errors show a short message and do not crash.

## Server verify

`POST /api/google/play/verify` requires a signed-in, verified user.

The server exchanges a Google service-account JWT for an access token (`https://www.googleapis.com/auth/androidpublisher`) and calls:

`purchases.subscriptionsv2` for `GOOGLE_PLAY_PACKAGE_NAME` + `purchaseToken`.

A grant requires all of:

- package name matches
- product id is one of the four SKUs and matches a line item
- optional `orderId` matches `latestOrderId` when both are present
- state is `SUBSCRIPTION_STATE_ACTIVE`, `SUBSCRIPTION_STATE_CANCELED` (still inside the period), or `SUBSCRIPTION_STATE_IN_GRACE_PERIOD`
- `expiryTime` is in the future

Otherwise the route returns 4xx and does not change `profiles.subscription_status`.

The purchase row is stored in `google_play_purchases`. `purchase_token` is the primary key. If that token already belongs to a different `user_id`, the route returns 409.

Logs may include a 12-character hash of `user_id` and the last 6 characters of the token. They must not include the full token or the service-account JSON.

Env:

- `GOOGLE_PLAY_PACKAGE_NAME`
- `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` — full JSON in one env value, not a file in git
- optional product id and base plan overrides (see `.env.example`)

In Play Console → API access, invite that service account and grant financial data / view subscriptions.

## Entitlement merge

`profiles.subscription_status` and `current_period_end` are the entitlement the app reads. Stripe, Apple, and Google Play can all be on file for one user.

When a source is verified:

- A live higher plan wins (`pro_heavy` over `pro` / `trialing`).
- The same plan rank keeps the later `current_period_end`.
- An expired or inactive incoming purchase does not replace a different live source.
- An expired update from the source that currently owns the profile (`billing_provider`) may clear that profile back to `canceled`.
- The losing source stays in its own table (`stripe_subscriptions`, `apple_transactions`, or `google_play_purchases`) so a later renewal can win again.

`billing_provider` is the source that last won. Google does not clear `stripe_subscription_id` or Apple ids. Apple still clears `stripe_subscription_id` only when the Apple update is the one written onto the profile.

## Real-time notifications (P1)

Verify + Restore is enough to launch. Play real-time developer notifications (Pub/Sub) are not wired. Until they are, renewals, cancellations, and revokes update the profile on the next verify or Restore, not within seconds. Add a Pub/Sub push endpoint later, parallel to `POST /api/apple/notifications`.

## Play Console (manual)

1. Monetize → Subscriptions. Create the four subscription IDs above. Under each, add a base plan id `monthly` or `yearly` (auto-renewing, no free trial required) and set the USD price from the table: Pro $9.99/month or $79/year, Heavy $19.99/month or $159/year.
2. Activate the base plans and add them to the app.
3. License testing: add the Google accounts that will buy without a real charge.
4. API access: create or reuse a service account, grant subscription visibility, put its JSON in `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
5. Optional later: Monetization setup → Real-time developer notifications.

Do not put a website payment link in the Play listing or the binary.

## Closed testing — Billing isn’t available

If Pricing shows **Google Play Billing isn’t available on this device**:

1. The phone’s **Google account must be a closed tester** and must **accept the Play Console invite** (email or opt-in link). No invite banner usually means this step was skipped.
2. Install/update the app **from the Play Store testing link**, not a sideloaded APK/AAB. Sideload often returns `BILLING_UNAVAILABLE`.
3. Open the Play Store app once while logged into that tester account (China devices: Play Store / Play Services must actually work).
4. Confirm the four subscriptions are **Active** with base plans `monthly` / `yearly`.
5. Tap Subscribe again. The red error should now include `Detail: supported=… · products=…` (web deploy of the diagnostic; no new AAB required if the shell loads `garagegenius.cloud`).
6. Optional on a USB-debug phone: `adb logcat | grep -i NativePurchases` — the plugin logs Google’s `debugMessage` for setup failures.

## Hand test

Use an internal testing track or a license tester. The published binary only picks this up after a web deploy and a new `versionCode` that includes this client.

1. Sign in on the Android app.
2. Open Pricing. Confirm four choices (Pro / Heavy × monthly / yearly), localized prices, **Subscribe with Google Play**, and **Restore purchases**. Confirm there is no “open the website to pay” control.
3. Buy one plan. After the sheet closes, the account should show Pro or Heavy only if `/api/google/play/verify` returned ok.
4. Force-quit, sign in again, tap Restore. The plan remains.
5. On a user who already has a live higher Apple or Stripe plan, the Play purchase is stored but the higher plan stays.
6. On iOS, subscribe and restore with Apple as before. With no Google row, the Apple grant is unchanged.
7. Cancel the purchase sheet and confirm the app stays on the current plan.

Apply migration `supabase/migrations/063_google_play_billing.sql` before the first verify in each environment.
