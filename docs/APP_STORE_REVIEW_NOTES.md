# App Store Review Notes — Garage Genius AI (v1.0 (6))

Use this file for **App Store Connect → App Review Information → Notes** and the resubmit checklist.

Do **not** paste passwords into git. Rotate any password that already appeared in a previous Review Notes field or screenshot.

**This submission:** Version **1.0**, Build **6**. Xcode `CURRENT_PROJECT_VERSION` is 6. Archive this binary (do not resubmit 1.0 (5)).

### Before Submit for Review

1. `npx cap sync ios` → Xcode Archive **1.0 (6)** → Upload to App Store Connect.
2. iPad smoke: native Apple sheet (not Safari) → DeepSeek dialog → pricing scrolls → StoreKit Subscribe sheet.
3. Attach all four IAP products to this version.
4. Paste Review Notes below. Demo account in ASC must be **Free** (`xietian691428+appstore@gmail.com` or a new Free account). Never the 163 QA account.
5. Fill Sandbox Apple ID. Confirm Supabase Apple Client IDs include `com.garagegenius.ai`.

---

## Paste into App Store Connect Review Notes

```
Garage Genius AI sells Pro and Pro Heavy as auto-renewable Apple In-App Purchases inside this iOS app.

In-App Purchase product IDs (attach all four to this version):
• com.garagegenius.ai.pro.monthly
• com.garagegenius.ai.pro.yearly
• com.garagegenius.ai.heavy.monthly
• com.garagegenius.ai.heavy.yearly

How to review (iPad or iPhone):
1. Tap Sign in with Apple (system sheet — not Safari). Email/password also works.
2. After login, an AI processing consent dialog names DeepSeek. Tap Agree to continue, or Not now to skip AI features.
3. Open Account → View plans & subscribe (or open Subscribe with Apple). Localized App Store prices load from StoreKit. Tap Subscribe to Pro or Heavy to present the system purchase sheet.
4. Restore purchases is on the same subscription page and on Account.
5. Manage or cancel: Account → Manage Apple subscription, or iPad Settings → Apple ID → Subscriptions.

Review demo account: sign in with the email/password in App Review Information. That account is Free (not Pro) so Subscribe is tappable. Use a Sandbox Apple ID for the purchase sheet.

Website Stripe checkout is only on the Safari website, not in this app.
```

---

## Review account (must be Free)

Apple needs to **tap IAP**. Do not give them a Pro / Pro Heavy / unlimited-token / 2100-trial QA account.

Checklist in Supabase (`profiles` for that user):

- `subscription_status` = `free` (not `pro`, `pro_heavy`, `trialing`)
- `has_acknowledged_ai_consent` = false (so they see the DeepSeek dialog)
- Not in any unlimited-token allowlist / QA unlock

Create a **new** reviewer email if the old demo account was already Pro or its password leaked into previous notes.

Also fill App Review Information:

- Demo **email + password** (Garage Genius account)
- **Sandbox Apple ID** (for the StoreKit sheet)

---

## 2.1(a) — Sign in with Apple (iPad)

The previous rejection (`code challenge does not match previously saved code verifier`) was PKCE in an in-app browser popover. This build uses **native ASAuthorization** on iOS Capacitor (`@capawesome/capacitor-apple-sign-in`) → `supabase.auth.signInWithIdToken`.

**Ops (once):**

1. Xcode → Signing & Capabilities → **Sign in with Apple** (already in `ios/App/App/App.entitlements`).
2. Apple Developer → App ID `com.garagegenius.ai` has Sign in with Apple.
3. Supabase → Authentication → Providers → Apple → **Client IDs** must include **both**:
   - Services ID (website OAuth)
   - iOS bundle ID `com.garagegenius.ai` (native `signInWithIdToken`)
4. After code change: `npx cap sync ios` → Archive **1.0 (6)** (this submission).

Google is hidden in the iOS app (same Browser PKCE risk). Email/password remains.

---

## 3.1.1 — In-App Purchase

### Products (auto-renewable)

Create these subscription product IDs in App Store Connect and **submit them with this binary**:

| Product ID | Maps to |
|---|---|
| `com.garagegenius.ai.pro.monthly` | Pro monthly |
| `com.garagegenius.ai.pro.yearly` | Pro yearly |
| `com.garagegenius.ai.heavy.monthly` | Pro Heavy monthly |
| `com.garagegenius.ai.heavy.yearly` | Pro Heavy yearly |

Until ASC shows the products as **Ready to Submit** / attached to the version, StoreKit prices may be empty and the purchase sheet will fail.

### How to purchase / restore

1. Sign in (Free account).
2. Account → **View plans & subscribe**, or any Upgrade paywall.
3. Prices should come from StoreKit (`priceString`). Tap Subscribe → system purchase sheet.
4. Server verifies StoreKit 2 JWS at `POST /api/apple/verify`.
5. **Restore purchases** on Pricing and Account.
6. **Manage Apple subscription** opens Apple’s subscription UI (not a website checkout).

### Multi-platform

- **iOS app:** Apple IAP only. No Stripe Checkout, no token packs, no “buy/manage on website” buttons.
- **Website (Safari):** Stripe Checkout / Customer Portal (3.1.3(b)).
- Android Play Billing is not in this build.

### Server notifications

App Store Server Notifications V2 →  
`https://garagegenius.cloud/api/apple/notifications`

### Env (Vercel / ops — not in binary)

- `APPLE_BUNDLE_ID=com.garagegenius.ai`
- `APPLE_APP_APPLE_ID=<App Store Connect numeric app id>` (required for Production verify)

---

## 5.1.1 / 5.1.2 — DeepSeek consent

After login, `/app` shows a **centered** dialog (iPad-safe) that names **DeepSeek**, purpose, and data categories. **I agree** / **Not now**.

Consent is stored in `profiles.has_acknowledged_ai_consent`. Privacy Policy alone is not the consent UI.

---

## iPad smoke (do this on a real iPad / TestFlight before submit)

1. Sign in with Apple → system sheet, lands in `/app`.
2. AI consent appears → Agree.
3. Open subscription page → four products show **App Store prices** (not only hardcoded USD).
4. Tap Subscribe → **system purchase sheet** (Sandbox Apple ID).
5. Email/password login still works.

This machine’s unit tests cannot present ASAuthorization or StoreKit sheets. Device verification is required.

---

## Privacy nutrition labels

Align App Privacy answers with: account contact info, user content (photos/chats), product interaction, purchases (Apple), and DeepSeek as a third-party AI processor for user content.
