# App Review Response — Garage Genius AI (resubmission)

**Build:** 1.0 (7)  
**Bundle ID:** com.garagegenius.ai

Do **not** paste passwords into this file or git. Put the Free demo password only in App Store Connect.

---

Hello App Review Team,

Thank you for the screenshots and notes on Guidelines **2.1(a)**, **2.1(b)**, **2.3.10**, and **3.1.2(c)**. This build addresses each item.

## 1) Guideline 2.1(a) — Sign in with Apple

The previous error (`Unacceptable audience in id_token: [com.garagegenius.ai]`) was a server Client ID mismatch. Native Sign in with Apple issues an identity token whose audience is the iOS bundle ID `com.garagegenius.ai`. That bundle ID is now included in our Apple provider Client IDs so `signInWithIdToken` accepts the token.

Sign in with Apple uses the **system authorization sheet** (not Safari). Email/password remains available.

### How to test
1. On the Create account / Sign in screen, tap **Sign in with Apple**.
2. Complete the system sheet. The app should land in Home without an audience error.

## 2) Guideline 2.3.10 — Third-party platforms

We removed Android/desktop references from iOS-visible UI text. In this iPhone and iPad app, the OBD helper now only says that live Bluetooth OBD is unavailable in-app and directs users to:

- Enter fault code
- Upload OBD screenshot

No Android/desktop/Chrome wording is shown in the iOS OBD flow.

## 3) Guideline 2.1(b) — In-App Purchase products

The four auto-renewable subscriptions are submitted with this binary:

- `com.garagegenius.ai.pro.monthly`
- `com.garagegenius.ai.pro.yearly`
- `com.garagegenius.ai.heavy.monthly`
- `com.garagegenius.ai.heavy.yearly`

Please review them together with 1.0 (7).

## 4) Guideline 3.1.2(c) — Subscription information

**In the app** (Subscribe with Apple / Account → View plans & subscribe):

- Subscription titles: Pro, Pro Heavy  
- Length: monthly or yearly  
- Price: App Store localized price  
- Links: **Privacy Policy** and **Terms of Use (EULA)** (Apple Standard EULA)

**In App Store metadata:**

- Privacy Policy URL: `https://garagegenius.cloud/privacy`  
- Terms of Use (EULA): Apple Standard EULA  
  `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`

## Demo account

Use the email and password in App Review Information. That account is **Free** so Subscribe is tappable. Please use a Sandbox Apple ID for the purchase sheet.

Thank you for reviewing again.
