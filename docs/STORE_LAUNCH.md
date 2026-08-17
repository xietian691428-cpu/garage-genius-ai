# App Store / Play Store launch guide — Garage Genius AI

Last updated: 2026-07-28  
Canonical site: **https://garagegenius.cloud**  
Bundle ID / applicationId: **com.garagegenius.ai**  
Marketing version: **1.0.0** (iOS `MARKETING_VERSION` / Android `versionName`)  
Native shell: Capacitor 8 (remote URL → production Next.js)

---

## Status snapshot

| Area | Status |
|------|--------|
| Capacitor `ios/` + `android/` | **Scaffolded in repo** |
| Permission strings (camera / mic / photos / BT) | **Declared** |
| Stripe inside native WebView | **Blocked in client** (`lib/billing.ts`) |
| StoreKit / Play Billing IAP | **iOS StoreKit 2 wired** (`@capgo/native-purchases` + `/api/apple/verify`); Android Play Billing still pending |
| Universal Links / App Links templates | **Present** (replace Team ID + SHA-256) |
| Screenshots / store listing assets | **You — create in consoles** |
| Sign in with Apple (if Google enabled) | **Ops — enable in Supabase + Apple** |

---

## 1. Architecture (recommended)

```
┌─────────────────────────────┐
│ Capacitor iOS / Android     │
│ WKWebView / Chrome WebView  │
│ server.url =                │
│ https://garagegenius.cloud   │
└─────────────┬───────────────┘
              │ HTTPS
              ▼
┌─────────────────────────────┐
│ Next.js on Vercel           │
│ Auth / Chat / Coach / …     │
└─────────────┬───────────────┘
              │
     ┌────────┴────────┐
     ▼                 ▼
  Web: Stripe       Native: IAP (future)
```

**Do not** open Stripe Checkout / Customer Portal inside the store WebView for digital Pro unlocks. iOS uses StoreKit 2 IAP; website uses Stripe. See `docs/APP_STORE_REVIEW_NOTES.md`.

---

## 2a. iOS internal test (TestFlight) — do this first

Android waits until iOS smoke is green.

```bash
npm run cap:sync   # or: npx cap sync ios
npm run cap:ios    # opens Xcode
```

### In Xcode (one-time)

1. Open **App** target → **Signing & Capabilities**
2. Team: your Apple Developer team (paid account required for TestFlight)
3. Bundle ID must stay **`com.garagegenius.ai`** (create App ID in Apple Developer if missing)
4. Optionally add capability **Associated Domains** → `applinks:garagegenius.cloud` (after Team ID is in AASA)
5. Select a physical iPhone (simulator works for UI smoke; camera/mic better on device)
6. Product → **Run** (⌘R) — confirms shell loads `https://garagegenius.cloud`

### Archive → TestFlight

1. Scheme: **App** · Destination: **Any iOS Device**
2. Product → **Archive**
3. Organizer → **Distribute App** → **App Store Connect** → Upload
4. App Store Connect → app **Garage Genius AI** → TestFlight → add Internal testers
5. Wait for processing + compliance (export encryption already set `ITSAppUsesNonExemptEncryption=false` in Info.plist)

### Smoke checklist on device

- [ ] Splash → web app loads (needs network to `garagegenius.cloud`)
- [ ] Sign up / sign in (email verify works)
- [ ] Add vehicle / Dashboard / Chat / Coach
- [ ] Camera or photo pick for receipt / OBD screenshot
- [ ] OBD live Bluetooth **not** offered as working on iOS (manual code / screenshot)
- [ ] Pricing upgrade shows store-safe message (no Stripe Checkout in WebView)
- [ ] Delete account path still reachable in Settings

### Blockers for paid IAP

Internal TestFlight can ship **Free + trial** features. Do **not** rely on in-app Stripe for digital Pro until StoreKit is wired.

---

## 2b. App icon & splash (source → generate)

Brand colors: background **`#0a0f1c`**, accent **`#22d3ee`** (same as landing). Mark = cyan rounded square + dark car silhouette (no wordmark on the icon).

### Source file specs (put under `resources/`)

| File | Size | Notes |
|------|------|--------|
| `icon-only.png` | **1024×1024** | Opaque RGB, **no transparency**, no rounded mask (stores apply masking) |
| `icon-foreground.png` | **1024×1024** | Transparent PNG; keep mark inside ~66% center safe zone (Android adaptive) |
| `icon-background.png` | **1024×1024** | Solid `#0a0f1c` (or subtle texture) |
| `splash.png` | **≥2732×2732** | Centered logo on `#0a0f1c` |
| `splash-dark.png` | **≥2732×2732** | Same as splash for this dark-first app |

Regenerate from the designer master (preferred):

```bash
# Place / replace resources/brand-master.png (1024×1024, final art)
npm run cap:assets:sources   # scripts/apply-brand-master-assets.py
npm run cap:assets           # expands to iOS + Android
npm run cap:sync
```

Procedural fallback (old generator): `python3 scripts/generate-native-brand-assets.py` — only if no master art.

### Generate into native projects

```bash
npm run cap:assets
# expands to @capacitor/assets generate --assetPath resources --ios --android …
npm run cap:sync
```

### Output layout (after generate)

```
resources/                          # sources only
ios/App/App/Assets.xcassets/
  AppIcon.appiconset/AppIcon-512@2x.png
  Splash.imageset/Default@*~universal~anyany*.png
android/app/src/main/res/
  mipmap-*/ic_launcher*.png         # mdpi…xxxhdpi + adaptive foreground/background
  mipmap-anydpi-v26/ic_launcher*.xml
  drawable*/splash.png              # port/land + night variants
```

`capacitor.config.ts` SplashScreen: `#0a0f1c`, show ~1.2s, fade-out 300ms, auto-hide.

### Local verification

```bash
npm run cap:sync
npm run cap:ios       # Xcode → Run → home-screen icon + LaunchScreen
npm run cap:android   # Android Studio → Run → launcher + splash
```

Checks:

- [ ] iOS home screen / App Store Connect icon uses cyan car mark (not Capacitor default)
- [ ] Android adaptive icon looks correct on circle / squircle
- [ ] Cold start splash is dark `#0a0f1c` with centered mark, then fades into WebView
- [ ] No white flash between native splash and `garagegenius.cloud`

Key files:

| File | Purpose |
|------|---------|
| `capacitor.config.ts` | appId, server URL, allowNavigation, SplashScreen |
| `resources/` | Icon + splash **sources** for `@capacitor/assets` |
| `native-shell/www/` | Offline splash fallback |
| `ios/App/App/Info.plist` | Privacy usage strings + `garagegenius://` scheme |
| `android/app/src/main/AndroidManifest.xml` | Permissions + intent filters |
| `lib/native-platform.ts` | Detect native shell |
| `lib/billing.ts` | Blocks Stripe on native |

Override remote URL when needed:

```bash
CAPACITOR_SERVER_URL=https://garagegenius.cloud npm run cap:sync
```

---

## 3. Permissions — store copy (use these verbatim)

### iOS (Info.plist — already set)

| Key | Purpose text |
|-----|----------------|
| Camera | Garage Genius uses the camera so you can photograph vehicle parts, OBD screens, and repair receipts for AI DIY guidance. |
| Photo Library | Garage Genius needs photo library access so you can choose existing vehicle, OBD, or receipt images for diagnosis. |
| Microphone | Garage Genius uses the microphone for hands-free voice coaching while your hands are busy under the hood (Pro / trial). |
| Bluetooth | Bluetooth is reserved for future native OBD adapters. On iOS today, use Enter fault code or an OBD screenshot instead of live Bluetooth OBD. |

### Android (manifest — already set)

Camera, microphone, Bluetooth (optional feature), read images / legacy storage, Internet.

### Product honesty — OBD on iOS

Web Bluetooth **does not work** in iOS WKWebView. UI already routes users to **Enter fault code** or **OBD screenshot** (`lib/obd.ts` → `capacitor_ios`). Do **not** market “Bluetooth OBD on iPhone” until a native BLE plugin ships.

---

## 4. Payment compliance — recommendation

### What we sell
Digital features: Pro / Pro Heavy subscriptions and token packs (content / AI quota). These are **in-app digital goods**.

### What will fail review
Loading Stripe Checkout or Stripe Portal inside the Capacitor WebView as the primary way to buy Pro/tokens.

### Recommended path (highest chance to pass)

**Phase A — first store binary (fastest honest path)**  
1. Ship Free + email-verified trial features that already work without new IAP.  
2. Keep Stripe on **mobile Safari / desktop web** only.  
3. In the native app, paid upgrade CTAs show an honest message (already enforced by `lib/billing.ts`): use web, or wait for IAP.  
4. Optional later: Apple “External Link Account” / Play external offers — region-limited; still not a full substitute for IAP for digital unlocks in many cases.

**Phase B — before promoting paid plans inside the apps**  
1. Implement **StoreKit 2** (iOS) + **Play Billing** (Android) for:  
   - `pro_monthly`, `pro_yearly`, `heavy_monthly`, `heavy_yearly`  
   - token packs as consumables (optional)  
2. Server verifies receipts / Play RTDN and writes the same `profiles.subscription_status` fields Stripe uses.  
3. Detect `Capacitor.isNativePlatform()` → IAP UI; web → Stripe.

**Do not** mix “Stripe-only WebView checkout” into the first App Store submission if you show Upgrade buttons that charge for digital access.

---

## 5. Deep links

### Custom scheme
- `garagegenius://auth/callback`  
- Declared in iOS `CFBundleURLTypes` and Android intent-filter.

### Universal Links / App Links (https://garagegenius.cloud)
Templates live at:

- `https://garagegenius.cloud/.well-known/apple-app-site-association`  
- `https://garagegenius.cloud/.well-known/assetlinks.json`  

**You must:**

1. Replace `TEAMID` in `apple-app-site-association` with your Apple Team ID (**done:** `JUUADU6WTN`).  
2. Replace `REPLACE_WITH_PLAY_APP_SIGNING_SHA256` with Play App Signing cert fingerprint.  
3. Xcode → Signing & Capabilities → **Associated Domains**: `applinks:garagegenius.cloud` (**wired in** `App.entitlements`)  
4. Supabase Redirect URLs also include:  
   `https://garagegenius.cloud/auth/callback`  
   `garagegenius://auth/callback`

OAuth PKCE still returns to `/auth/callback` on the WebView origin when using the remote `server.url` (preferred for v1).

---

## 6. Store listing copy (templates)

### App name
**Garage Genius AI**

### Subtitle (Apple, ≤30 characters)
**DIY auto repair coach**

### Short description (Play, ≤80 characters)
**AI DIY coach for diagnosis, parts, and safer driveway repairs.**

### Full description (EN)

```
Garage Genius AI is a DIY auto-repair coach for weekend mechanics in the US & EU.

• Vehicle dashboard — tap a region for checklists before you turn a bolt
• AI chat diagnosis — vehicle-aware guidance (not a licensed mechanic)
• Coach playbooks — step-by-step DIY scenarios with safety confirms
• Parts inventory — save what you need for the next job
• Receipt scan — log shop work into maintenance history
• Voice coaching (Pro / trial) — hands-free readouts when your hands are greasy

IMPORTANT SAFETY NOTICE
Garage Genius provides general DIY educational guidance only. It is not a substitute for a licensed mechanic, official service manuals, or professional shop work. High-risk systems (brakes, airbags, fuel, jacking, hybrid/EV high voltage) require extra caution — confirm with a qualified technician when unsure.

Insurance tips about modifications / non-OEM parts are educational reminders only. Garage Genius AI does not provide insurance or legal advice and never determines whether a claim will be covered — always check your policy or contact your insurer.

On iPhone, live Bluetooth OBD is not available; enter fault codes manually or upload an OBD screenshot. BLE OBD works on supported Android Chrome environments with compatible adapters.

Privacy Policy: https://garagegenius.cloud/privacy
Terms of Service: https://garagegenius.cloud/terms
Support: xietian691428@gmail.com · Settings → Billing help (in app) or your store support URL
```

### Spanish short blurb (optional locale)

```
Coach DIY de reparación automotriz con IA: diagnóstico, piezas y guías paso a paso. No sustituye a un mecánico certificado.
```

### Review Notes (paste into App Review / Play)

```
Demo account
Email: [CREATE reviewer@garagegenius.cloud test user]
Password: [provide]

How to test
1. Sign in (email must be verified — confirmation link sent on signup).
2. Add a vehicle or use onboarding.
3. Open Chat / Coach / Dashboard. Camera may request permission for photos/receipts.
4. Voice mic is Pro/trial only.
5. iOS Bluetooth OBD is intentionally unavailable — use “Enter fault code” or OBD screenshot.
6. In-app Stripe checkout is disabled in the native shell for store compliance. Paid upgrades on web: https://garagegenius.cloud/pricing

No gambling, no user-generated dating, no third-party content marketplace.
```

---

## 7. Privacy nutrition / Data safety checklist

Declare collection for:

| Data | Linked to user? | Purpose |
|------|-----------------|---------|
| Email / user ID | Yes | Account |
| Vehicle profile | Yes | App functionality |
| Optional country/region + insurer label | Yes | Personalized insurance *education* tips only (not claim adjudication) |
| Chat / coach text | Yes | App functionality |
| Photos (vehicle / OBD / receipts) | Yes | App functionality → AI processing |
| Purchase history (when IAP/Stripe) | Yes | Commerce |
| Diagnostics / crash (if you add later) | Optional | Analytics |

**Insurance tips:** Modifications / non-OEM reminders are educational only. Do not claim coverage outcomes. Product does not scrape or store full insurer policy terms for auto-adjudication.

**Not collected for core app:** precise location, contacts, tracking for ads (no third-party ad SDK today).

Privacy Policy URL: **https://garagegenius.cloud/privacy**  
Terms URL: **https://garagegenius.cloud/terms**

---

## 8. Manual console checklist

### Apple Developer / App Store Connect
- [ ] App ID `com.garagegenius.ai` with Sign In with Apple (if Google login is offered)
- [ ] Capabilities: Associated Domains, Sign In with Apple
- [ ] Create app record, age rating, export compliance (HTTPS only → usually exempt)
- [ ] Privacy Policy URL + App Privacy answers
- [ ] Screenshots: iPhone 6.7" + 6.1" (and iPad if you claim tablet)
- [ ] Reviewer demo account (verified email)
- [ ] Decide: Free-only native v1 **or** wait for StoreKit products
- [ ] Replace `TEAMID` in AASA file and redeploy web

### Google Play Console
- [ ] App `com.garagegenius.ai`, Data safety form aligned with Privacy Policy
- [ ] Content rating questionnaire
- [ ] Store listing + phone screenshots (+ 7" / 10" tablet if claimed)
- [ ] App signing → copy SHA-256 into `assetlinks.json` and redeploy
- [ ] If selling digital goods: Play Billing (not Stripe WebView)
- [ ] Target API level per current Play requirements

### Supabase / ops
- [ ] Confirm email ON
- [ ] Redirect URLs include production + `garagegenius://auth/callback`
- [ ] Apple / Google providers only when buttons enabled (`NEXT_PUBLIC_AUTH_*`)

---

## 9. Current blockers (before paid native launch)

1. **No IAP implementation** — native Stripe is blocked; paid in-app upgrades cannot ship until StoreKit + Play Billing exist.  
2. **Universal Links not finalized** — Team ID + Play SHA-256 placeholders.  
3. **Java / Android SDK** may be missing locally — `npx cap open android` after installing Android Studio.  
4. **Sign in with Apple** must be live if Google is offered on iOS.  
5. **Store screenshots / icons** not produced yet.  
6. **Mainland China network** — Vercel may be unreachable without VPN; store builds still load `garagegenius.cloud` (plan CDN/China strategy separately if needed).

---

## 10. Next engineering milestones (after this scaffold)

1. ~~Wire `@capacitor/app` URL open → navigate WebView~~ — `NativeDeepLinkBridge` in root layout.  
2. StoreKit 2 + Play Billing products + server receipt verify.  
3. Optional native BLE plugin for iOS OBD.  
4. ~~App icon set + splash assets in `ios/` / `android/`~~ — see §2b (`npm run cap:assets`).  
5. TestFlight / internal testing track smoke (auth, chat, coach, camera, delete account).
