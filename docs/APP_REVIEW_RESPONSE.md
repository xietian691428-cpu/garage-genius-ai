# App Review Response — Garage Genius AI (resubmission)

**Submission ID reference:** 3c4172e0-… (prior rejection)  
**Build:** 1.0 (5)  
**Bundle ID:** com.garagegenius.ai

---

Hello App Review Team,

Thank you for the feedback on Guidelines **3.1.1** and **5.1.1 / 5.1.2**. We have addressed both issues in this build.

## 1) Guideline 3.1.1 — In-App Purchase

Digital Pro / Pro Heavy access is now sold **only via Apple In-App Purchase (StoreKit 2)** inside the iOS app.

- **Auto-renewable subscriptions** (not consumables):
  - `com.garagegenius.ai.pro.monthly`
  - `com.garagegenius.ai.pro.yearly`
  - `com.garagegenius.ai.heavy.monthly`
  - `com.garagegenius.ai.heavy.yearly`
- Users can **purchase**, **restore purchases**, and **manage subscriptions** in-app (Account → plans / Upgrade paywalls).
- Entitlements sync to the signed-in Garage Genius account after server verification of the StoreKit 2 transaction.
- Stripe Checkout is **not** used inside the app WebView. The website (Safari) remains Stripe-only for web users.
- An optional “view plan details on website” link opens the **system browser** only as a secondary path — **not** the sole purchase method.

### How to test IAP
1. Sign in with the demo account below.
2. Open **Account** → **View plans & subscribe**, or trigger any Upgrade paywall.
3. Purchase Pro or Heavy (monthly/yearly) with a Sandbox Apple ID.
4. Tap **Restore purchases** if needed.
5. **Manage Apple subscription** opens Apple’s subscription management UI.

## 2) Guideline 5.1.1 / 5.1.2 — Third-party AI (DeepSeek)

Before the **first** DeepSeek-backed request (Chat, photo diagnose, OBD screenshot vision, Dashboard AI inspect, receipt scan, Shop Report generate), the app shows a **mandatory consent modal** that discloses:

- **Recipient:** DeepSeek  
- **Purpose:** vehicle diagnosis and repair coaching  
- **Data categories:** message text, optional photos, vehicle context, related diagnostic details  

The user must actively tap **I agree**. **Not now** declines — no DeepSeek API call is made. Consent is persisted on the account. Privacy Policy §4 documents this.

### How to test AI consent
1. Sign in (use a fresh account, or an account that has not yet agreed).  
2. Open **AI** → send any vehicle question.  
3. Consent modal appears → Agree to continue / Decline to block the call.

## Demo account (in-app sign-in)

Email: `18565006079@163.com`  
Password: *(the password we previously shared for this QA account — paste the real password from your notes into App Store Connect)*

Please use a **Sandbox Apple ID** for IAP purchases.

## Multi-platform note

- **iOS app:** Apple IAP for digital Pro/Heavy.  
- **Website:** Stripe.  
- Android Play Billing is not in this iOS submission.

Thank you for reviewing again.

---

**Paste tip:** In App Store Connect → App Review Information → Notes, paste the sections above and replace the password placeholder with the real demo password.
