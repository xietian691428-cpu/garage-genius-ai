import { describe, expect, it } from "vitest";
import { shouldWriteEntitlement } from "@/lib/billing-entitlement-commit";
import {
  ALL_GOOGLE_PLAY_PRODUCT_IDS,
  googleProductIdForSelection,
  planFromGoogleProductId,
} from "@/lib/google-play-products";
import {
  assertPurchaseTokenOwner,
  GooglePlayVerifyError,
  readPlayEntitlement,
} from "@/lib/google-play-server";

const PRO_MONTHLY = googleProductIdForSelection({
  plan: "pro",
  interval: "monthly",
});
const HEAVY_YEARLY = googleProductIdForSelection({
  plan: "pro_heavy",
  interval: "yearly",
});

describe("Google Play product mapping", () => {
  it("maps four product ids to pro and pro_heavy", () => {
    expect(ALL_GOOGLE_PLAY_PRODUCT_IDS).toHaveLength(4);
    expect(planFromGoogleProductId(PRO_MONTHLY)).toBe("pro");
    expect(planFromGoogleProductId(HEAVY_YEARLY)).toBe("pro_heavy");
    expect(
      planFromGoogleProductId(
        googleProductIdForSelection({ plan: "pro", interval: "yearly" }),
      ),
    ).toBe("pro");
    expect(
      planFromGoogleProductId(
        googleProductIdForSelection({ plan: "pro_heavy", interval: "monthly" }),
      ),
    ).toBe("pro_heavy");
  });
});

describe("Google Play entitlement merge", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");

  it("keeps a higher live plan from another source", () => {
    expect(
      shouldWriteEntitlement(
        {
          status: "pro_heavy",
          expiresAt: "2026-12-01T00:00:00Z",
          source: "apple",
        },
        {
          status: "pro",
          expiresAt: "2027-01-01T00:00:00Z",
          source: "google_play",
        },
        now,
      ),
    ).toBe(false);
  });

  it("replaces a lower plan and prefers the later expiry on a tie", () => {
    expect(
      shouldWriteEntitlement(
        { status: "pro", expiresAt: "2026-07-01T00:00:00Z", source: "stripe" },
        {
          status: "pro_heavy",
          expiresAt: "2026-08-01T00:00:00Z",
          source: "google_play",
        },
        now,
      ),
    ).toBe(true);
    expect(
      shouldWriteEntitlement(
        { status: "pro", expiresAt: "2026-07-01T00:00:00Z", source: "apple" },
        {
          status: "pro",
          expiresAt: "2026-09-01T00:00:00Z",
          source: "google_play",
        },
        now,
      ),
    ).toBe(true);
    expect(
      shouldWriteEntitlement(
        { status: "pro", expiresAt: "2026-12-01T00:00:00Z", source: "apple" },
        {
          status: "pro",
          expiresAt: "2026-08-01T00:00:00Z",
          source: "google_play",
        },
        now,
      ),
    ).toBe(false);
  });

  it("does not let an expired Google purchase replace another live source", () => {
    expect(
      shouldWriteEntitlement(
        { status: "pro", expiresAt: "2026-12-01T00:00:00Z", source: "stripe" },
        {
          status: "pro_heavy",
          expiresAt: "2026-01-01T00:00:00Z",
          source: "google_play",
        },
        now,
      ),
    ).toBe(false);
  });

  it("does not let an expired Apple update clear a Stripe plan with no billing_provider", () => {
    expect(
      shouldWriteEntitlement(
        { status: "pro", expiresAt: "2026-12-01T00:00:00Z", source: null },
        { status: "canceled", expiresAt: "2026-01-01T00:00:00Z", source: "apple" },
        now,
      ),
    ).toBe(false);
  });

  it("lets Apple replace a free profile when there is no Google row", () => {
    expect(
      shouldWriteEntitlement(
        { status: "free", expiresAt: null, source: null },
        { status: "pro", expiresAt: "2026-12-01T00:00:00Z", source: "apple" },
        now,
      ),
    ).toBe(true);
  });
});

describe("Google Play verify rules", () => {
  const now = Date.parse("2026-06-01T00:00:00Z");

  it("rejects a token already bound to another user", () => {
    expect(() => assertPurchaseTokenOwner("user-a", "user-b")).toThrow(
      GooglePlayVerifyError,
    );
    try {
      assertPurchaseTokenOwner("user-a", "user-b");
    } catch (err) {
      expect(err).toBeInstanceOf(GooglePlayVerifyError);
      expect((err as GooglePlayVerifyError).status).toBe(409);
    }
    expect(() => assertPurchaseTokenOwner("user-a", "user-a")).not.toThrow();
    expect(() => assertPurchaseTokenOwner(null, "user-a")).not.toThrow();
  });

  it("does not entitle an expired, revoked, or mismatched purchase", () => {
    expect(
      readPlayEntitlement(
        {
          subscriptionState: "SUBSCRIPTION_STATE_EXPIRED",
          lineItems: [
            { productId: PRO_MONTHLY, expiryTime: "2026-12-01T00:00:00Z" },
          ],
        },
        PRO_MONTHLY,
        now,
      ).entitled,
    ).toBe(false);

    expect(
      readPlayEntitlement(
        {
          subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
          lineItems: [
            { productId: PRO_MONTHLY, expiryTime: "2026-01-01T00:00:00Z" },
          ],
        },
        PRO_MONTHLY,
        now,
      ).entitled,
    ).toBe(false);

    expect(
      readPlayEntitlement(
        {
          subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
          lineItems: [
            { productId: HEAVY_YEARLY, expiryTime: "2026-12-01T00:00:00Z" },
          ],
        },
        PRO_MONTHLY,
        now,
      ).entitled,
    ).toBe(false);

    const active = readPlayEntitlement(
      {
        subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
        latestOrderId: "GPA.1234",
        lineItems: [
          { productId: HEAVY_YEARLY, expiryTime: "2026-12-01T00:00:00Z" },
        ],
      },
      HEAVY_YEARLY,
      now,
    );
    expect(active.entitled).toBe(true);
    expect(active.plan).toBe("pro_heavy");
  });
});
