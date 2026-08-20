import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateRawNonce, sha256Hex } from "@/lib/apple-nonce";
import {
  isGoogleOAuthButtonVisible,
  isNativeAppleCancelError,
  shouldUseNativeAppleSignIn,
} from "@/lib/native-apple-auth";
import { shouldAutoShowAiConsent } from "@/lib/ai-consent";
import {
  ALL_APPLE_PRODUCT_IDS,
  APPLE_PRODUCT_IDS,
} from "@/lib/apple-iap-products";
import { APP_DESKTOP_MIN_PX } from "@/lib/app-chrome";
import { hideWebCheckoutUi } from "@/lib/native-platform";
import {
  displayIapPrice,
  storeKitPriceByProductId,
} from "@/lib/storekit-price-display";

describe("Apple nonce (PKCE-safe native SIWA)", () => {
  it("SHA-256 matches the known vector for abc", async () => {
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("generateRawNonce returns hex of the requested length", () => {
    const nonce = generateRawNonce(16);
    expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  });
});

describe("native Apple vs web OAuth policy", () => {
  it("uses native Apple only on iOS Capacitor", () => {
    expect(
      shouldUseNativeAppleSignIn({ nativeCapacitor: true, platform: "ios" }),
    ).toBe(true);
    expect(
      shouldUseNativeAppleSignIn({ nativeCapacitor: false, platform: "ios" }),
    ).toBe(false);
    expect(
      shouldUseNativeAppleSignIn({ nativeCapacitor: true, platform: "web" }),
    ).toBe(false);
  });

  it("hides Google on native iOS even when the env flag is on", () => {
    expect(
      isGoogleOAuthButtonVisible({ googleEnabled: true, nativeIos: true }),
    ).toBe(false);
    expect(
      isGoogleOAuthButtonVisible({ googleEnabled: true, nativeIos: false }),
    ).toBe(true);
    expect(
      isGoogleOAuthButtonVisible({ googleEnabled: false, nativeIos: false }),
    ).toBe(false);
  });

  it("treats SIGN_IN_CANCELED as a user cancel", () => {
    expect(isNativeAppleCancelError({ code: "SIGN_IN_CANCELED" })).toBe(true);
    expect(isNativeAppleCancelError({ message: "Sign in was canceled." })).toBe(
      true,
    );
    expect(isNativeAppleCancelError({ message: "network" })).toBe(false);
  });
});

describe("IAP product IDs and store UI", () => {
  it("exposes the four App Store Connect product IDs", () => {
    expect(ALL_APPLE_PRODUCT_IDS).toEqual([
      "com.garagegenius.ai.pro.monthly",
      "com.garagegenius.ai.pro.yearly",
      "com.garagegenius.ai.heavy.monthly",
      "com.garagegenius.ai.heavy.yearly",
    ]);
    expect(APPLE_PRODUCT_IDS.PRO_MONTHLY).toBe(
      "com.garagegenius.ai.pro.monthly",
    );
  });

  it("hides website Stripe checkout whenever billing is not web_stripe", () => {
    expect(hideWebCheckoutUi("web_stripe")).toBe(false);
    expect(hideWebCheckoutUi("native_iap")).toBe(true);
    expect(hideWebCheckoutUi("native_blocked")).toBe(true);
  });

  it("prefers StoreKit localized priceString over USD fallback", () => {
    const prices = storeKitPriceByProductId([
      {
        identifier: "com.garagegenius.ai.pro.monthly",
        priceString: "$12.99",
      },
    ]);
    expect(
      displayIapPrice({
        productId: "com.garagegenius.ai.pro.monthly",
        storeKitPrices: prices,
        loaded: true,
        fallbackUsd: 9,
      }),
    ).toEqual({ label: "$12.99", fromStoreKit: true });
    expect(
      displayIapPrice({
        productId: "com.garagegenius.ai.pro.yearly",
        storeKitPrices: prices,
        loaded: false,
        fallbackUsd: 90,
      }),
    ).toEqual({ label: "…", fromStoreKit: false });
  });
});

describe("AI consent gate", () => {
  it("auto-prompts only after load for a signed-in user who has not agreed", () => {
    expect(
      shouldAutoShowAiConsent({
        loaded: false,
        hasUser: true,
        acknowledged: false,
      }),
    ).toBe(false);
    expect(
      shouldAutoShowAiConsent({
        loaded: true,
        hasUser: true,
        acknowledged: false,
      }),
    ).toBe(true);
    expect(
      shouldAutoShowAiConsent({
        loaded: true,
        hasUser: true,
        acknowledged: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoShowAiConsent({
        loaded: true,
        hasUser: false,
        acknowledged: false,
      }),
    ).toBe(false);
  });
});

describe("source regressions for App Store 2.1 / 3.1.1", () => {
  it("does not open Apple login in a popover Browser on native", () => {
    const auth = readFileSync("hooks/useAuth.ts", "utf8");
    expect(auth).toContain("signInWithNativeApple");
    expect(auth).not.toContain('presentationStyle: "popover"');
  });

  it("does not tell reviewers the app has no IAP", () => {
    const notes = readFileSync("docs/APP_STORE_REVIEW_NOTES.md", "utf8");
    expect(notes).not.toMatch(/does not offer In-App Purchases/i);
    expect(notes).toContain("com.garagegenius.ai.pro.monthly");
    expect(notes).toContain("com.garagegenius.ai.heavy.yearly");
  });

  it("removes website billing CTAs from iOS purchase UI", () => {
    const files = [
      "components/landing/PricingCards.tsx",
      "components/ui/UpgradeModal.tsx",
      "components/settings/SettingsPanel.tsx",
      "app/pricing/PricingPageClient.tsx",
    ];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      expect(src, file).not.toContain(
        "openWebManageSubscriptionInSystemBrowser",
      );
    }
    expect(readFileSync("lib/native-iap.ts", "utf8")).not.toContain(
      "openWebManageSubscriptionInSystemBrowser",
    );
  });

  it("ensureConsent waits for consent load instead of returning false", () => {
    const hook = readFileSync("hooks/useAiConsent.ts", "utf8");
    expect(hook).not.toMatch(/if\s*\(\s*!loaded\s*\)\s*return Promise\.resolve\(false\)/);
    expect(hook).toContain("shouldAutoShowAiConsent");
    expect(hook).toContain("loadedWaitersRef");
  });

  it("pricing UI loads StoreKit prices", () => {
    expect(readFileSync("components/landing/PricingCards.tsx", "utf8")).toContain(
      "useAppleStoreKitPrices",
    );
    expect(readFileSync("components/ui/UpgradeModal.tsx", "utf8")).toContain(
      "useAppleStoreKitPrices",
    );
  });

  it("keeps iPad Air landscape on tablet chrome, not desktop sidebar", () => {
    expect(APP_DESKTOP_MIN_PX).toBe(1280);
    const page = readFileSync("app/app/page.tsx", "utf8");
    expect(page).toContain("hidden h-full xl:block");
    expect(page).toContain("xl:hidden");
    expect(page).not.toMatch(/hidden lg:block/);
    const chat = readFileSync("components/chat/ChatApp.tsx", "utf8");
    expect(chat).toContain("xl:block xl:min-h-0");
    expect(chat).toContain("xl:hidden");
    expect(chat).toContain("xl:flex");
  });

  it("consent modal is a centered dialog (iPad-safe)", () => {
    const modal = readFileSync(
      "components/legal/AiProviderConsentModal.tsx",
      "utf8",
    );
    expect(modal).toContain("items-center justify-center");
    expect(modal).not.toContain("items-end");
  });
});
