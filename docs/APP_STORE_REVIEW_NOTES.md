# App Store Review Notes — Garage Genius AI (v1.0.4 (14))

Use this file for **App Store Connect → App Review Information → Notes** and the resubmit checklist.

Do **not** paste passwords into git. Rotate any password that already appeared in a previous Review Notes field or screenshot.

**This submission:** Version **1.0.4**, Build **14**. Archive this binary (do not resubmit older builds).  
**Also in this binary:** optional native BLE OBD (ELM327-compatible adapters) via `@capacitor-community/bluetooth-le`; Privacy Manifest; In-App Purchase capability enabled; `arm64` device requirement.

### Before Submit for Review

1. **Supabase → Authentication → Providers → Apple → Client IDs** must include **`com.garagegenius.ai`** (bundle ID).
2. App Store Connect **App Description** (or EULA field) must include:  
   `https://www.apple.com/legal/internet-services/itunes/dev/stdeula/`
3. Privacy Policy field: `https://garagegenius.cloud/privacy`
4. **Attach all four IAP products to 1.0.4 (14)** with App Review screenshots, then submit IAPs **with** the new binary (Guideline 2.1(b)).
5. Deploy web to `garagegenius.cloud`, then `npx cap sync ios` → Xcode Archive **1.0.4 (14)** → Upload. Confirm **In-App Purchase** is on the App ID / provisioning profile.
6. iPhone smoke: cold launch stays open (no immediate quit); Sign in with Apple lands in `/app` and **stays** signed in.
7. Demo account in ASC must be **Free** with DeepSeek consent unset. Never the 163 QA account.
8. Bluetooth: Connect OBD may request Bluetooth permission; reviewers are not required to have an adapter.

---

## Paste into App Store Connect Review Notes

```
Garage Genius AI sells Pro and Pro Heavy as auto-renewable Apple In-App Purchases inside this iOS app.

In-App Purchase product IDs (attach all four to this version):
• com.garagegenius.ai.pro.monthly
• com.garagegenius.ai.pro.yearly
• com.garagegenius.ai.heavy.monthly
• com.garagegenius.ai.heavy.yearly

How to review (iPhone or iPad):
1. Tap Sign in with Apple (system sheet — not Safari). After success you should land on Home and stay signed in. Email/password also works.
2. After login, an AI processing consent dialog names DeepSeek (chat) and Kimi (photos). Tap Agree to continue, or Not now to skip AI features.
3. Open Account → View plans & subscribe (or open Subscribe with Apple). Localized App Store prices load from StoreKit. Tap Subscribe to Pro or Heavy to present the system purchase sheet.
4. Restore purchases is on the same subscription page and on Account.
5. Manage or cancel: Account → Manage Apple subscription, or Settings → Apple ID → Subscriptions.
6. Optional Bluetooth OBD: Chat / Coach / Dashboard → Connect OBD may request Bluetooth and scan for ELM327 BLE adapters. Not required for review — use Enter fault code or an OBD screenshot. Classic Bluetooth-only adapters are not supported yet; compatibility is not guaranteed for every dongle.

Review demo account: sign in with the email/password in App Review Information. That account is Free (not Pro) so Subscribe is tappable, and the DeepSeek consent dialog will appear. Use a Sandbox Apple ID for the purchase sheet.

Website Stripe checkout is only on the Safari website, not in this app.
```

---

## Review account (must be Free)

Apple needs to **tap IAP**. Do not give them a Pro / Pro Heavy / unlimited-token / 2100-trial QA account.

Checklist in Supabase (`profiles` for that user):

- `subscription_status` = `free` (not `pro`, `pro_heavy`, `trialing`)
- `has_acknowledged_ai_consent` = false (so they see the DeepSeek dialog)
- Not in any unlimited-token allowlist / QA unlock

Also fill App Review Information:

- Demo **email + password** (Garage Genius account)
- **Sandbox Apple ID** (for the StoreKit sheet)

---

## 2.1(a) — Sign in with Apple (stay signed in)

Native ASAuthorization → `supabase.auth.signInWithIdToken`. The app waits for a confirmed session, hard-navigates to Home, and does not redirect to login while session bootstrap is still loading.

**Ops (once):**

1. Xcode → Signing & Capabilities → **Sign in with Apple**.
2. Apple Developer → App ID `com.garagegenius.ai` has Sign in with Apple.
3. Supabase Apple Client IDs include Services ID **and** bundle ID `com.garagegenius.ai`.
4. `npx cap sync ios` → Archive **1.0.2 (12)**.

Google is hidden in the iOS app. Email/password remains.

---

## 3.1.1 / 2.1(b) — In-App Purchase

### Products (auto-renewable)

| Product ID | Maps to |
|---|---|
| `com.garagegenius.ai.pro.monthly` | Pro monthly |
| `com.garagegenius.ai.pro.yearly` | Pro yearly |
| `com.garagegenius.ai.heavy.monthly` | Pro Heavy monthly |
| `com.garagegenius.ai.heavy.yearly` | Pro Heavy yearly |

Attach all four to **this version** with review screenshots before Submit for Review.

### How to purchase / restore

1. Sign in (Free account).
2. Account → **View plans & subscribe**.
3. Tap Subscribe → system purchase sheet (physical device + Sandbox Apple ID).
4. Server verifies at `POST /api/apple/verify`.
5. **Restore purchases** on Pricing and Account.

### Multi-platform

- **iOS app:** Apple IAP only.
- **Website (Safari):** Stripe (3.1.3(b)).

### Server notifications

`https://garagegenius.cloud/api/apple/notifications`

---

## 5.1.1 / 5.1.2 — DeepSeek consent

After login, `/app` shows a centered dialog naming **DeepSeek**. Consent is stored in `profiles.has_acknowledged_ai_consent`.

---

## Bluetooth / OBD (optional)

`NSBluetoothAlwaysUsageDescription` / `NSBluetoothPeripheralUsageDescription` explain OBD-II diagnostic reads for AI DIY guidance. Live BLE is optional; Enter fault code and OBD screenshot remain available. See `docs/OBD_BLUETOOTH.md`.

---

## Device smoke before submit

1. Sign in with Apple → stays on Home (no bounce to login).
2. AI consent appears → Agree.
3. Subscription page → StoreKit prices → purchase sheet.
4. Email/password demo login still works.
5. Connect OBD → Bluetooth permission prompt → scan list (hardware optional).
