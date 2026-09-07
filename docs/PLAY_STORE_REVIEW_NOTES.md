# Google Play Console — Garage Genius AI (v1.0.0 / versionCode 8)

Use this file for **Play Console listing + Data safety + review notes**.

Do **not** paste passwords into git.

**This Android binary:** versionName **1.0.0**, versionCode **8** (aligned with iOS build 8).  
**Package:** `com.garagegenius.ai`  
**This version does not sell subscriptions in the Play app.** No Play Billing SKUs. Do not add paid in-app products until Play Billing is implemented.

Website Stripe Checkout stays on **Chrome / desktop / mobile Safari** only. The Android WebView must not start card checkout, and must not tell users to “buy on the website.”

---

## Before you create the Play listing

1. Deploy web to `https://garagegenius.cloud` (this Capacitor shell loads that URL).
2. Play Console → create app → **App signing** → copy **App signing key certificate SHA-256**.
3. Paste that fingerprint into `public/.well-known/assetlinks.json` (replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256`) and redeploy web so App Links can verify.
4. Build a **release AAB** (Android Studio / `bundleRelease`), upload to an **internal testing** track first.
5. Demo account must be **Free** (not the internal Unlimited QA account). Email verified. DeepSeek consent unset so reviewers see the consent dialog.

---

## Paste into Play Console — short description (≤80 characters)

```
AI DIY coach for diagnosis, parts, and safer driveway repairs.
```

(72 characters including spaces.)

---

## Paste into Play Console — full description

```
Garage Genius AI is a DIY auto-repair coach for weekend mechanics.

• Vehicle dashboard — tap a region for checklists before you turn a bolt
• AI chat diagnosis — vehicle-aware educational guidance (not a licensed mechanic)
• Coach playbooks — step-by-step DIY scenarios with safety confirms
• Parts inventory — save what you need for the next job
• Receipt scan — log shop work into maintenance history
• Enter a fault code or upload an OBD screenshot when you have a scan tool

IMPORTANT SAFETY NOTICE
Garage Genius provides general DIY educational guidance only. It is not a substitute for a licensed mechanic, official service manuals, or professional shop work. High-risk systems (brakes, airbags, fuel, jacking, hybrid/EV high voltage) require extra caution — confirm with a qualified technician when unsure.

Insurance tips about modifications / non-OEM parts are educational reminders only. Garage Genius AI does not provide insurance or legal advice and never determines whether a claim will be covered — always check your policy or contact your insurer.

This Android version includes Garage Genius’s free coaching features. It does not sell subscriptions inside the app.

Privacy Policy: https://garagegenius.cloud/privacy
Terms of Service: https://garagegenius.cloud/terms
Support: xietian691428@gmail.com
```

---

## Optional Spanish short blurb

```
Coach DIY de reparación automotriz con IA: diagnóstico, piezas y guías paso a paso. No sustituye a un mecánico certificado.
```

---

## Play Console review notes (paste)

```
Garage Genius AI is a DIY auto-repair education app. This Android version does not sell subscriptions or digital goods in the app. There is no Google Play Billing product in this release.

How to test
1. Sign in with the email/password in the review form (email is already verified).
2. An AI processing consent dialog names DeepSeek (chat) and Kimi (photos). Tap Agree to continue, or Not now to skip AI features.
3. Add a vehicle (or finish onboarding), then open Home, Chat, and Coach.
4. Camera / photos may request permission for vehicle photos, OBD screenshots, or receipts.
5. Live Bluetooth OBD is optional and not required. Reviewers can use Enter fault code or an OBD screenshot.
6. Settings includes Delete account.

Demo account: use the email/password in the Play Console review form. That account is Free so quota-limited features behave as a new user. Do not use an unlimited internal QA account.

No gambling, no user-generated dating, no third-party content marketplace.
```

---

## Data safety (align with Privacy Policy)

Declare collection that actually happens for a signed-in user:

| Data type | Collected? | Linked to user? | Purpose |
|-----------|------------|-----------------|--------|
| Email address | Yes | Yes | Account |
| User IDs | Yes | Yes | Account |
| Photos (user-uploaded vehicle / OBD / receipts) | Yes (user-initiated) | Yes | App functionality |
| Other user-generated content (chat, vehicle profile, maintenance notes) | Yes | Yes | App functionality |
| App interactions / crash (if you later add Play vitals only) | Optional | — | Analytics (only if you add an SDK) |
| Purchase history | Yes if the same account was billed on the website; **this Play app does not process Play purchases** | Yes | App functionality (plan status on the account) |

**Not used for ads / not sold.** No third-party advertising SDK in this binary.

**Approximate location / contacts / SMS:** not collected for core features.

Data deletion: Settings → Delete account. Privacy policy URL: `https://garagegenius.cloud/privacy`

---

## Permissions — reviewer-facing purpose

| Permission | Why |
|------------|-----|
| Camera | Photograph vehicle parts, OBD screens, and repair receipts for AI DIY guidance. |
| Microphone | Hands-free voice coaching when the user enables it. |
| Photos / images | Choose existing vehicle, OBD, or receipt images. |
| Bluetooth / BLE | Optional future or Web Bluetooth OBD adapters. Not required to use the app. Enter fault code and OBD screenshot always work. |
| Internet | Load the Garage Genius service. |

---

## Content rating / policy

- Educational / tools. Not a mechanic license. Not medical.
- Age: typically **PEGI 3 / ESRB Everyone** unless the questionnaire flags otherwise.
- Do **not** claim the app replaces a licensed mechanic.
- Do **not** add “Buy Pro on our website” buttons, banners, or review-notes CTAs. That violates Google Play Payments for digital goods.

---

## After Play App Signing SHA-256 is known

1. Update `public/.well-known/assetlinks.json`
2. Redeploy production
3. Play Console → App content → App Links / Deep links verification
