# App Review Response — Garage Genius AI (resubmission)

**Build:** 1.0 (8)  
**Bundle ID:** com.garagegenius.ai

Do **not** paste passwords into this file or git. Put the Free demo password only in App Store Connect.

---

Hello App Review Team,

Thank you for the notes on Guidelines **2.1(a)** and **2.1(b)** for Submission ID `3c4172e0-cf21-495c-8aad-8129e5a92073` (version 1.0 build 7). This build **1.0 (8)** addresses both items.

## 1) Guideline 2.1(a) — Sign in with Apple returning to login

We fixed a post-login race on iOS: after the system Sign in with Apple sheet succeeded, the app could navigate to Home before the session was fully available to the auth gate, which briefly sent reviewers back to the login screen.

In this build:

- Native Sign in with Apple waits for a confirmed Supabase session before leaving the login screen.
- After a successful native Apple sign-in, the app performs a full navigation to Home so the auth gate remounts against the saved session.
- The auth gate no longer redirects to login while session bootstrap is still in progress.
- The native Apple flow allows enough time for the system sheet (it is no longer raced by a short timeout).

### How to test
1. Fresh install (or update) on iPhone / iPad.
2. Tap **Sign in with Apple** and complete the system sheet.
3. The app should land on Home and stay signed in (not return to login).
4. Email/password login also remains available (demo account below).

## 2) Guideline 2.1(b) — In-App Purchase products

The four auto-renewable subscriptions are submitted **with this binary** and include App Review screenshots in App Store Connect:

- `com.garagegenius.ai.pro.monthly`
- `com.garagegenius.ai.pro.yearly`
- `com.garagegenius.ai.heavy.monthly`
- `com.garagegenius.ai.heavy.yearly`

Please review the IAPs together with **1.0 (8)**.

### How to test IAP
1. Sign in with the Free demo account in App Review Information (or Sign in with Apple).
2. After login, an AI processing consent dialog names DeepSeek (chat) and Kimi (photos) — tap Agree (or Not now to skip AI).
3. Open Account → View plans & subscribe.
4. Tap Subscribe → system purchase sheet (use a Sandbox Apple ID).
5. Restore purchases is on the same page.

## Demo account

Use the email and password in App Review Information. That account is **Free** and will show the DeepSeek consent dialog again. Please use a Sandbox Apple ID for the purchase sheet.

Thank you for reviewing again.
