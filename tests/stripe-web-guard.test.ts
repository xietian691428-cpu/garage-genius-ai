import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import {
  STRIPE_STORE_SHELL_BLOCKED,
  stripeBlockedForStoreRequest,
} from "@/lib/stripe-web-guard";

function reqWithUa(ua: string): NextRequest {
  return new NextRequest("https://garagegenius.cloud/api/stripe/checkout", {
    method: "POST",
    headers: { "user-agent": ua },
  });
}

describe("Stripe store-shell guard", () => {
  it("blocks Checkout/Portal/recharge from iOS and Android store WebViews", () => {
    expect(
      stripeBlockedForStoreRequest(
        reqWithUa(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 GarageGeniusNative",
        ),
      ),
    ).toBe(true);
    expect(
      stripeBlockedForStoreRequest(
        reqWithUa(
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36 GarageGeniusNative",
        ),
      ),
    ).toBe(true);
  });

  it("allows real mobile browsers (website Stripe)", () => {
    expect(
      stripeBlockedForStoreRequest(
        reqWithUa(
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
        ),
      ),
    ).toBe(false);
    expect(
      stripeBlockedForStoreRequest(
        reqWithUa(
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
        ),
      ),
    ).toBe(false);
  });

  it("blocked copy is not a buy-on-website CTA", () => {
    expect(STRIPE_STORE_SHELL_BLOCKED).toMatch(/not available in the store app/i);
    expect(STRIPE_STORE_SHELL_BLOCKED).not.toMatch(/website|safari|open chrome/i);
  });

  it("Stripe payment routes call the store-shell guard", () => {
    for (const file of [
      "app/api/stripe/checkout/route.ts",
      "app/api/stripe/portal/route.ts",
      "app/api/stripe/recharge/route.ts",
      "app/api/stripe/support/portal/route.ts",
    ]) {
      const src = readFileSync(file, "utf8");
      expect(src).toContain("stripeBlockedForStoreRequest");
      expect(src).toContain("stripeStoreShellBlockedJson");
    }
    expect(readFileSync("app/api/stripe/portal/route.ts", "utf8")).toContain(
      "/app?tab=settings&billing=portal",
    );
  });
});
