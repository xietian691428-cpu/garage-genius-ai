# App Store / Play Store prep (Phase 3)

Web product ships first. Native stores need a Capacitor (or similar) shell plus
IAP policy decisions. Use this after Phase 1–2 (Web) are green.

## 8. Capacitor shell

Prerequisites: Apple Developer + Google Play Console accounts, Mac for iOS.

```bash
# From repo root (after Web build works)
npm install @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Garage Genius AI" com.garagegenius.ai --web-dir=out
# Prefer Next static export OR load production URL in a WebView.
# Recommended launch path: Capacitor loads https://NEXT_PUBLIC_APP_URL (server-rendered).
```

Minimal `capacitor.config.ts` pattern:

```ts
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.garagegenius.ai",
  appName: "Garage Genius AI",
  webDir: "public", // placeholder if using remote URL
  server: {
    url: process.env.NEXT_PUBLIC_APP_URL, // https://garagegenius.cloud
    cleartext: false,
  },
};

export default config;
```

Then:

```bash
npx cap add ios
npx cap add android
npx cap sync
npx cap open ios      # Xcode → signing → Archive
npx cap open android  # Android Studio → bundle
```

Also configure:
- [ ] Bundle ID / applicationId match store listings
- [ ] Deep links / Universal Links for `/auth/callback`
- [ ] Sign in with Apple (iOS required if other social logins exist)
- [ ] Privacy Policy + Terms URLs in store metadata (`/privacy`, `/terms`)

See `docs/AUTH_PROVIDERS.md` for Apple/Google OAuth.

## 9. IAP vs Stripe (digital goods)

| Surface | Payment |
|---------|---------|
| Mobile web / desktop | Stripe Checkout + Portal (current) |
| iOS / Android **in-app** unlock of Pro / tokens | Prefer **Apple/Google IAP** (or External Link / Reader where allowed) |

Do **not** wrap the existing Stripe Checkout WebView as the only upgrade path inside store builds without legal review.

Hybrid approach:
1. Detect Capacitor (`Capacitor.isNativePlatform()`).
2. Native → StoreKit / Play Billing products mirroring Pro monthly/yearly (+ Heavy).
3. Web → keep Stripe.
4. Webhook / server verifies IAP receipts and sets `profiles.subscription_status` the same way Stripe does.

## 10. Listing assets checklist

- [ ] App name + subtitle (≤30 / ≤30 Apple)
- [ ] Short + full description (DIY coach; not certified mechanic)
- [ ] Screenshots: phone (+ tablet if claimed) for Coach, Chat, Dashboard, Pricing
- [ ] Privacy nutrition labels / Data safety (account, vehicle, chat, purchase)
- [ ] Support URL + Marketing URL
- [ ] Age rating (typically 12+ / Teen — vehicles / tools context)
- [ ] Export compliance / encryption questionnaires
- [ ] Reviewer demo account (Free + optional Pro test)

## Status

Scaffold docs only until Capacitor project is generated in-repo (`ios/`, `android/`).
