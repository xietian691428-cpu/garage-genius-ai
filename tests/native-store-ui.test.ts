import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NATIVE_DELETE_ACCOUNT_BODY,
  NATIVE_LANDING_CTA,
  NATIVE_LANDING_KICKER,
  canUseNativeIap,
  getBillingMode,
  requestLooksStoreShell,
  storeSafePlanLabel,
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
  it("names DeepSeek and requires affirmative agreement", () => {
    expect(AI_CONSENT_COPY.recipient).toBe("DeepSeek");
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

  it("landing store CTA avoids trial pitch", () => {
    expect(NATIVE_LANDING_CTA).toBe("Create account");
    expect(NATIVE_LANDING_KICKER).not.toMatch(/14-day|Start free/i);
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
});
