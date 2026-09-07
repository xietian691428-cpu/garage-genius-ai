import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  NATIVE_DELETE_ACCOUNT_BODY,
  NATIVE_LANDING_CTA,
  NATIVE_LANDING_KICKER,
  NATIVE_LANDING_KICKER_ANDROID,
  NATIVE_NO_IAP_MESSAGE,
  NATIVE_TERMS_BILLING_BULLETS_ANDROID,
  canUseNativeIap,
  getBillingMode,
  hideStorePurchaseUi,
  nativeLandingKicker,
  requestLooksStoreShell,
  storeSafePlanLabel,
  storeShellPlatformFromRequest,
  userAgentLooksLikeIosAppWebView,
  userAgentLooksNative,
} from "@/lib/native-platform";
import {
  ALL_APPLE_PRODUCT_IDS,
  appleProductIdForSelection,
  planFromAppleProductId,
} from "@/lib/apple-iap-products";
import { AI_CONSENT_COPY } from "@/lib/ai-consent";

describe("billing modes", () => {
  it("maps Apple product ids to Pro / Heavy", () => {
    expect(
      planFromAppleProductId(appleProductIdForSelection({ plan: "pro", interval: "monthly" })),
    ).toBe("pro");
    expect(
      planFromAppleProductId(
        appleProductIdForSelection({ plan: "pro_heavy", interval: "yearly" }),
      ),
    ).toBe("pro_heavy");
    expect(ALL_APPLE_PRODUCT_IDS).toHaveLength(4);
  });

  it("web defaults to Stripe mode outside Capacitor", () => {
    expect(getBillingMode()).toBe("web_stripe");
    expect(canUseNativeIap()).toBe(false);
  });
});

describe("DeepSeek consent copy", () => {
  it("names DeepSeek + Kimi and requires affirmative agreement", () => {
    expect(AI_CONSENT_COPY.recipient).toMatch(/DeepSeek/i);
    expect(AI_CONSENT_COPY.recipient).toMatch(/Kimi/i);
    expect(AI_CONSENT_COPY.agree.toLowerCase()).toContain("agree");
    expect(AI_CONSENT_COPY.dataCategories.length).toBeGreaterThanOrEqual(3);
  });
});

describe("store shell detection", () => {
  it("maps Pro Trial labels to Pro for store display", () => {
    expect(
      storeSafePlanLabel({ label: "Pro Trial", isTrialing: true }),
    ).toBe("Pro");
    expect(storeSafePlanLabel({ label: "Free" })).toBe("Free");
  });

  it("landing store CTA is Start free without Stripe no-card trial pitch", () => {
    expect(NATIVE_LANDING_CTA).toBe("Start free");
    expect(NATIVE_LANDING_KICKER).toMatch(/In-App Purchase/i);
    expect(NATIVE_LANDING_KICKER).not.toMatch(/14-day|no card/i);
  });

  it("delete-account copy mentions Apple subscriptions", () => {
    expect(NATIVE_DELETE_ACCOUNT_BODY.toLowerCase()).toContain("apple");
  });

  it("Info.plist microphone usage is present", () => {
    const plist = readFileSync("ios/App/App/Info.plist", "utf8");
    const mic = plist.match(
      /<key>NSMicrophoneUsageDescription<\/key>\s*<string>([^<]+)<\/string>/,
    )?.[1];
    expect(mic).toBeTruthy();
  });

  it("does not treat Mobile Safari as the store shell", () => {
    expect(
      userAgentLooksNative(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(
      requestLooksStoreShell({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      }),
    ).toBe(false);
    expect(
      requestLooksStoreShell({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
      }),
    ).toBe(true);
    expect(
      requestLooksStoreShell({
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GarageGeniusNative",
      }),
    ).toBe(true);
  });

  it("does not classify Android native UA as iOS WKWebView", () => {
    const androidUa =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 GarageGeniusNative";
    expect(userAgentLooksNative(androidUa)).toBe(true);
    expect(userAgentLooksLikeIosAppWebView(androidUa)).toBe(false);
    expect(storeShellPlatformFromRequest({ userAgent: androidUa })).toBe(
      "android",
    );
    expect(requestLooksStoreShell({ userAgent: androidUa })).toBe(true);
  });

  it("treats Android Chrome without the native token as website (Stripe allowed)", () => {
    const chromeUa =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
    expect(requestLooksStoreShell({ userAgent: chromeUa })).toBe(false);
    expect(storeShellPlatformFromRequest({ userAgent: chromeUa })).toBe("web");
  });
});

describe("Android Play billing policy copy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not steer Android users to website or Apple checkout", () => {
    const banned = /website|stripe|apple|iphone|safari/i;
    expect(NATIVE_NO_IAP_MESSAGE).not.toMatch(banned);
    expect(NATIVE_LANDING_KICKER_ANDROID).not.toMatch(banned);
    expect(NATIVE_LANDING_KICKER_ANDROID).not.toMatch(/14-day|no card/i);
    for (const bullet of NATIVE_TERMS_BILLING_BULLETS_ANDROID) {
      expect(bullet).not.toMatch(/stripe|buy on|open safari|website to/i);
    }
  });

  it("blocks billing mode and hides purchase CTAs for Android native UA", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("navigator", {
      userAgent:
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36 GarageGeniusNative",
    });
    expect(getBillingMode()).toBe("native_blocked");
    expect(canUseNativeIap()).toBe(false);
    expect(hideStorePurchaseUi()).toBe(true);
    expect(nativeLandingKicker()).toBe(NATIVE_LANDING_KICKER_ANDROID);
  });
});
