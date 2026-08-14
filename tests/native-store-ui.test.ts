import { describe, expect, it } from "vitest";
import {
  NATIVE_ACCOUNT_LIMITS_BODY,
  NATIVE_ACCOUNT_LIMITS_TITLE,
  NATIVE_NO_IAP_MESSAGE,
  NATIVE_WEBSITE_MANAGE_HINT,
  storeSafePlanLabel,
} from "@/lib/native-platform";
import { nativeAccountLimitsCopy } from "@/lib/upgrade-copy";

const FORBIDDEN = /14[-\s]?day|pro trial|free trial|start trial|in-app purchase|storekit|go pro|subscribe|unlock all/i;

describe("iOS store-safe purchase copy (Guideline 2.1(b))", () => {
  it("native notices never mention trials, IAP, or buy CTAs", () => {
    for (const text of [
      NATIVE_NO_IAP_MESSAGE,
      NATIVE_ACCOUNT_LIMITS_TITLE,
      NATIVE_ACCOUNT_LIMITS_BODY,
      NATIVE_WEBSITE_MANAGE_HINT,
    ]) {
      expect(text).not.toMatch(FORBIDDEN);
    }
    expect(NATIVE_ACCOUNT_LIMITS_TITLE).toBe("Account limits");
  });

  it("maps Pro Trial labels to Pro for store display", () => {
    expect(
      storeSafePlanLabel({ label: "Pro Trial", isTrialing: true }),
    ).toBe("Pro");
    expect(storeSafePlanLabel({ label: "Free" })).toBe("Free");
  });

  it("account-limits copy has no 14-day trial or purchase CTA", () => {
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
      expect(`${copy.title} ${copy.message} ${copy.bullets.join(" ")}`).not.toMatch(
        FORBIDDEN,
      );
    }
  });
});
