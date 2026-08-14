import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  NATIVE_ACCOUNT_LIMITS_BODY,
  NATIVE_ACCOUNT_LIMITS_TITLE,
  NATIVE_DELETE_ACCOUNT_BODY,
  NATIVE_NO_IAP_MESSAGE,
  NATIVE_PRIVACY_BILLING,
  NATIVE_PRIVACY_CHOICES,
  NATIVE_PRIVACY_PUSH,
  NATIVE_PRIVACY_USE,
  NATIVE_TERMS_BILLING_BULLETS,
  NATIVE_TERMS_BILLING_HEADING,
  NATIVE_WEBSITE_MANAGE_HINT,
  storeSafePlanLabel,
  userAgentLooksNative,
} from "@/lib/native-platform";
import { nativeAccountLimitsCopy } from "@/lib/upgrade-copy";
import en from "@/locales/en-US/common.json";
import es from "@/locales/es/common.json";

/** Reviewer keyword scan — user-visible iOS copy must not match. */
const FORBIDDEN =
  /\btrials?\b|\bupgrades?\b|\bsubscribe[ds]?\b|\bsubscriptions?\b/i;

function assertClean(label: string, text: string) {
  expect(text, label).not.toMatch(FORBIDDEN);
}

describe("iOS store-visible copy has no trial/upgrade/subscription words", () => {
  it("native notices are clean", () => {
    for (const [label, text] of [
      ["NATIVE_NO_IAP_MESSAGE", NATIVE_NO_IAP_MESSAGE],
      ["NATIVE_ACCOUNT_LIMITS_TITLE", NATIVE_ACCOUNT_LIMITS_TITLE],
      ["NATIVE_ACCOUNT_LIMITS_BODY", NATIVE_ACCOUNT_LIMITS_BODY],
      ["NATIVE_WEBSITE_MANAGE_HINT", NATIVE_WEBSITE_MANAGE_HINT],
      ["NATIVE_DELETE_ACCOUNT_BODY", NATIVE_DELETE_ACCOUNT_BODY],
      ["NATIVE_TERMS_BILLING_HEADING", NATIVE_TERMS_BILLING_HEADING],
      ["NATIVE_PRIVACY_BILLING", NATIVE_PRIVACY_BILLING],
      ["NATIVE_PRIVACY_PUSH", NATIVE_PRIVACY_PUSH],
      ["NATIVE_PRIVACY_USE", NATIVE_PRIVACY_USE],
      ["NATIVE_PRIVACY_CHOICES", NATIVE_PRIVACY_CHOICES],
    ] as const) {
      assertClean(label, text);
    }
    for (const bullet of NATIVE_TERMS_BILLING_BULLETS) {
      assertClean(bullet, bullet);
    }
    expect(NATIVE_ACCOUNT_LIMITS_TITLE).toBe("Account limits");
  });

  it("maps Pro Trial labels to Pro for store display", () => {
    expect(
      storeSafePlanLabel({ label: "Pro Trial", isTrialing: true }),
    ).toBe("Pro");
    expect(storeSafePlanLabel({ label: "Free" })).toBe("Free");
  });

  it("account-limits copy is clean for every reason", () => {
    const reasons = [
      "playbook",
      "annual",
      "history",
      "tags",
      "voice",
      "photo",
      "tokens",
      "vehicles",
      "shop_report",
      "generic",
    ] as const;
    for (const reason of reasons) {
      const copy = nativeAccountLimitsCopy(reason);
      expect(copy.title).toBe("Account limits");
      assertClean(
        reason,
        `${copy.title} ${copy.message} ${copy.bullets.join(" ")}`,
      );
    }
  });

  it("iOS-only i18n keys are clean (en + es)", () => {
    const enStore = [
      en.auth.verifyBodyStore,
      en.auth.signInSubtitleStore,
      en.settings.shareTextStore,
      en.settings.shareErrorStore,
      en.vehicles.planLimitStore,
      en.vehicles.limitReachedStore,
      en.shopReport.limitReachedStore,
    ];
    const esStore = [
      es.auth.verifyBodyStore,
      es.auth.signInSubtitleStore,
      es.settings.shareTextStore,
      es.settings.shareErrorStore,
      es.vehicles.planLimitStore,
      es.vehicles.limitReachedStore,
      es.shopReport.limitReachedStore,
    ];
    for (const text of [...enStore, ...esStore]) {
      assertClean("i18n store key", text);
    }
  });

  it("Info.plist microphone usage has no trial/upgrade words", () => {
    const plist = readFileSync("ios/App/App/Info.plist", "utf8");
    const mic = plist.match(
      /<key>NSMicrophoneUsageDescription<\/key>\s*<string>([^<]+)<\/string>/,
    )?.[1];
    expect(mic).toBeTruthy();
    assertClean("NSMicrophoneUsageDescription", mic ?? "");
  });

  it("does not treat Mobile Safari as the store shell", () => {
    expect(
      userAgentLooksNative(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
    expect(
      userAgentLooksNative(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GarageGeniusNative",
      ),
    ).toBe(true);
  });
});
