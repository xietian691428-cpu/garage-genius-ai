# App Review Response — Garage Genius AI (resubmission)

**Build:** 1.0 (6)  
**Bundle ID:** com.garagegenius.ai

Do **not** paste passwords into this file or git. Put the Free demo password only in App Store Connect.

---

Hello App Review Team,

Thank you for the feedback on Guidelines **2.1**, **3.1.1**, and **5.1.1 / 5.1.2**. We have addressed all three in this build.

## 1) Guideline 2.1 — Sign in with Apple (iPad)

Sign in with Apple now uses the **system ASAuthorization sheet** (native Sign in with Apple). It no longer opens an in-app browser / PKCE popover, which caused `code challenge does not match previously saved code verifier` on iPad.

Email/password sign-in remains available. Google is not offered inside the iOS app.

## 2) Guideline 3.1.1 — In-App Purchase

Digital Pro / Pro Heavy access is sold **only via Apple In-App Purchase (StoreKit 2)** inside the iOS app.

- **Auto-renewable subscriptions** (attach all four to this version):
  - `com.garagegenius.ai.pro.monthly`
  - `com.garagegenius.ai.pro.yearly`
  - `com.garagegenius.ai.heavy.monthly`
  - `com.garagegenius.ai.heavy.yearly`
- Users can **purchase**, **restore purchases**, and **manage subscriptions** in-app (Account → View plans & subscribe / Upgrade paywalls).
- Entitlements sync to the signed-in Garage Genius account after server verification of the StoreKit 2 transaction.
- Stripe Checkout is **not** used inside the app. The website (Safari) remains Stripe-only for web users.

### How to test IAP
1. Sign in with the **Free** demo account in App Review Information (not a Pro / trial account).
2. Open **Account** → **View plans & subscribe**, or **Subscribe with Apple**.
3. Localized App Store prices load from StoreKit. Purchase Pro or Heavy with a Sandbox Apple ID.
4. Tap **Restore purchases** if needed.
5. **Manage Apple subscription** opens Apple’s subscription management UI.

## 3) Guideline 5.1.1 / 5.1.2 — Third-party AI (DeepSeek)

After login, the app shows an **in-app consent dialog** that names **DeepSeek**, purpose (vehicle diagnosis and repair coaching), and data categories (message text, optional photos, vehicle context, related diagnostic details).

The user taps **I agree** or **Not now**. AI features do not run without agreement. Consent is stored on the account. Privacy Policy documents this processing.

### How to test AI consent
1. Sign in with the demo account (consent not yet acknowledged).
2. The DeepSeek dialog appears on `/app`.
3. Agree to continue / Not now to skip AI features.

## Demo account

Use the email and password in App Review Information. That account is **Free** so Subscribe is tappable. Please use a **Sandbox Apple ID** for the purchase sheet.

## Multi-platform note

- **iOS app:** Apple IAP for digital Pro/Heavy.
- **Website:** Stripe.
- Android Play Billing is not in this iOS submission.

Thank you for reviewing again.
