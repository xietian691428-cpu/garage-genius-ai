import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PLAN_ENTITLEMENTS,
  PRO_HEAVY_DISPLAY_NAME,
} from "@/lib/types/subscription";
import { upgradeCopy } from "@/lib/upgrade-copy";
import {
  budgetExceededMessage,
  visionQuotaMessage,
} from "@/lib/ai-cost/gate";
import {
  getFollowUpChips,
  selectConvergedFollowUps,
} from "@/lib/chat-repair-loop";
import { TOKEN_RECHARGE_PACKS } from "@/lib/types/tokens";

const JARGON = /\btokens?\b|hard cap|\bRAG\b|standard rag|deep rag|\bheavy\b/i;

describe("P0-1 consumerized plan copy", () => {
  it("uses one natural name for the top tier; internal id stays pro_heavy", () => {
    expect(PRO_HEAVY_DISPLAY_NAME).toBe("Multi-Car");
    expect(PLAN_ENTITLEMENTS.pro_heavy.label).toBe("Multi-Car");
    expect(PLAN_ENTITLEMENTS.pro_heavy.tier).toBe("pro_heavy");
  });

  it("no internal jargon in plan features / taglines / highlights", () => {
    for (const tier of ["free", "pro", "pro_heavy"] as const) {
      const p = PLAN_ENTITLEMENTS[tier];
      const blob = [p.label, p.tagline, p.highlight ?? "", ...p.features].join(
        "\n",
      );
      expect(blob, tier).not.toMatch(JARGON);
    }
  });

  it("keeps outcome numbers aligned with real entitlements", () => {
    const f = (t: "free" | "pro" | "pro_heavy") =>
      PLAN_ENTITLEMENTS[t].features.join("\n");
    expect(f("free")).toMatch(/1 vehicle/);
    expect(f("pro")).toMatch(/Up to 5 vehicles/);
    expect(f("pro_heavy")).toMatch(/Up to 10 vehicles/);
    expect(PLAN_ENTITLEMENTS.pro.maxVehicles).toBe(5);
    expect(PLAN_ENTITLEMENTS.pro_heavy.maxVehicles).toBe(10);
    expect(f("free")).toMatch(/3 shop reports/);
    expect(f("pro")).toMatch(/Unlimited shop reports/);
  });

  it("Free entry stays clear: $0, no card", () => {
    expect(PLAN_ENTITLEMENTS.free.priceMonthly).toBe(0);
    expect(PLAN_ENTITLEMENTS.free.tagline).toMatch(/\$0/);
  });

  it("upgrade / limit copy never prints internal USD budgets or token jargon", () => {
    for (const reason of [
      "tokens",
      "photo",
      "vehicles",
      "voice",
      "generic",
    ] as const) {
      const c = upgradeCopy(reason);
      expect(`${c.title} ${c.message} ${c.bullets.join(" ")}`).not.toMatch(
        JARGON,
      );
    }
    for (const plan of ["free", "pro", "pro_heavy"] as const) {
      const m = budgetExceededMessage(plan, 3);
      expect(m).not.toMatch(/\$\d/);
      expect(m).not.toMatch(/Pro Heavy/);
      expect(visionQuotaMessage(plan, 30)).not.toMatch(/Pro Heavy/);
    }
    expect(budgetExceededMessage("free", 0.25)).toMatch(/Upgrade to Pro/);
  });

  it("top-up pack labels hide token counts", () => {
    for (const p of TOKEN_RECHARGE_PACKS) {
      expect(p.label).not.toMatch(/token|\d+K/i);
    }
  });

  it("pricing surfaces no longer render raw token / hard-cap lines", () => {
    const cards = readFileSync("components/landing/PricingCards.tsx", "utf8");
    expect(cards).not.toMatch(/hard cap/i);
    expect(cards).not.toMatch(/k tokens/i);
    const landing = readFileSync("components/landing/LandingPage.tsx", "utf8");
    expect(landing).not.toMatch(/knows cars|actually knows|vehicle-aware RAG/i);
    expect(landing).toMatch(/not OEM-certified/i);
  });
});

describe("P0-2 chat action convergence", () => {
  it("caps follow-up chips at 2 and puts the safe-check path first", () => {
    const chips = getFollowUpChips({
      assistantText: "Replace the brake pads if worn. Check OEM parts.",
      userText: "squeal when braking",
    });
    const out = selectConvergedFollowUps(chips, 2);
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out[0].id).not.toBe("need-parts");
    expect(out[0].id).not.toBe("top3");
  });

  it("DTC replies: check-order / guide chips beat explain", () => {
    const chips = getFollowUpChips({
      assistantText: "P0420 catalyst efficiency below threshold.",
      userText: "P0420 on my Camry",
    });
    const out = selectConvergedFollowUps(chips, 2);
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out.some((c) => c.id === "dtc-explain") && out[0].id === "dtc-explain").toBe(
      false,
    );
  });

  it("MessageBubble: one primary CTA, secondary actions behind More, New topic untouched", () => {
    const src = readFileSync("components/chat/MessageBubble.tsx", "utf8");
    expect(src).toMatch(/chat-primary-cta/);
    expect(src).toMatch(/chat-more-actions/);
    // Old always-visible 4-button row and the big map button are gone.
    expect(src).not.toMatch(/Highlight \{focusCmd\.part\} on the map/);
    expect(src).toMatch(/selectConvergedFollowUps/);
    const chat = readFileSync("components/chat/ChatApp.tsx", "utf8");
    expect(chat).toMatch(/New topic/);
  });
});

describe("P0-3 Home hierarchy", () => {
  it("first screen has one primary CTA; secondary modules are collapsed", () => {
    const hub = readFileSync("components/home/HomeHub.tsx", "utf8");
    // Health snapshot is status-only (no onPrimary wired).
    expect(hub).toMatch(/<VehicleHealthSnapshot snapshot=\{health\} \/>/);
    expect(hub).toMatch(/home-more-toggle/);
    expect(hub).toMatch(/hidden=\{!moreOpen\}/);
    expect(hub).toMatch(/My Garage/);
    expect(hub).toMatch(/Save \/ Hand off/);
    // Order: next action → path strip → quick actions → collapsed more.
    const iNext = hub.indexOf("<NextRecommendedAction");
    const iPath = hub.indexOf("<HomePathStrip />");
    const iQuick = hub.indexOf("<QuickActionsRow");
    const iMore = hub.indexOf('data-testid="home-more"');
    expect(iNext).toBeGreaterThan(-1);
    expect(iNext).toBeLessThan(iPath);
    expect(iPath).toBeLessThan(iQuick);
    expect(iQuick).toBeLessThan(iMore);
  });
});
