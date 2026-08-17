# App Store Review Notes — Garage Genius AI (v1.0 build 5+)

Submission context: fix Guideline **3.1.1** (IAP) and **5.1.1 / 5.1.2** (third-party AI).

## Sandbox / test account

Provide your App Store Connect Sandbox Apple ID in App Review Information (do not commit secrets here).

Also provide a Garage Genius account (email + password) that can sign in inside the app.

## 3.1.1 — In-App Purchase (StoreKit 2)

### Products (auto-renewable)

Create these subscription product IDs in App Store Connect (same IDs as app defaults):

| Product ID | Maps to |
|---|---|
| `com.garagegenius.ai.pro.monthly` | Pro monthly |
| `com.garagegenius.ai.pro.yearly` | Pro yearly |
| `com.garagegenius.ai.heavy.monthly` | Pro Heavy monthly |
| `com.garagegenius.ai.heavy.yearly` | Pro Heavy yearly |

Optional intro offer in ASC can mirror web trial; web Stripe trial remains website-only.

### How to purchase / restore

1. Open the iOS app → sign in.
2. Go to **Account** (or any paywall → Upgrade) → **View plans & subscribe** / paywall buttons.
3. Choose Pro or Heavy (monthly/yearly). StoreKit sheet charges the Sandbox Apple ID.
4. Server verifies the StoreKit 2 JWS at `POST /api/apple/verify` and writes the same `profiles.subscription_status` fields used by Stripe (`pro` / `pro_heavy` / `trialing`).
5. Tap **Restore purchases** on Pricing or Account to re-sync.
6. **Manage Apple subscription** opens Apple’s subscription management UI.

### Multi-platform

- **iOS app:** Apple IAP only for digital Pro/Heavy (no Stripe Checkout inside the WebView).
- **Website (Safari):** Stripe Checkout / Customer Portal.
- Optional secondary link “plan details on website” opens the **system browser** (Capacitor Browser), not an in-app Stripe WebView checkout.
- Android Play Billing is not in this build; Android shell still blocks digital purchases.

### Server notifications

Configure App Store Server Notifications V2 →  
`https://garagegenius.cloud/api/apple/notifications`

### Env (Vercel / ops — not in binary)

- `APPLE_BUNDLE_ID=com.garagegenius.ai`
- `APPLE_APP_APPLE_ID=<App Store Connect numeric app id>` (required for Production verify)
- Optional overrides: `APPLE_IAP_PRO_MONTHLY`, `APPLE_IAP_PRO_YEARLY`, `APPLE_IAP_HEAVY_MONTHLY`, `APPLE_IAP_HEAVY_YEARLY`

## 5.1.1 / 5.1.2 — DeepSeek consent

### When the consent UI appears

On the **first** request that would call DeepSeek (Chat send, photo diagnose, OBD screenshot vision, Dashboard AI inspect, receipt scan, Shop Report generate), the app shows a modal that discloses:

- Recipient: **DeepSeek**
- Purpose: vehicle diagnosis / repair coaching
- Data categories: message text, optional photos, vehicle context, related diagnostic details

User must tap **I agree**. **Not now** declines — no DeepSeek call is made. Consent is stored in `profiles.has_acknowledged_ai_consent` (+ local cache). Server routes reject with `ai_consent_required` until agreed.

### Test path

1. Use an account that has never consented (or clear account / new signup).
2. Open **AI** tab → send any message about the selected vehicle.
3. Consent modal appears → Agree → chat proceeds.
4. Decline path: tap Not now → no AI reply / request aborted.
5. Privacy Policy §4 documents DeepSeek + in-app consent.

## Privacy nutrition labels

Align App Privacy answers with: account contact info, user content (photos/chats), product interaction, purchases (Apple), and data used for app functionality / analytics as applicable. Disclose DeepSeek as a third-party AI processor for user content.
