/**
 * Contextual upgrade copy for Free → Pro paywalls.
 */

import { PLAN_ENTITLEMENTS } from "@/lib/types/subscription";

export type UpgradeReason =
  | "playbook"
  | "annual"
  | "history"
  | "tags"
  | "voice"
  | "photo"
  | "tokens"
  | "vehicles"
  | "generic";

const PRO = PLAN_ENTITLEMENTS.pro;

export function yearlySavingsUsd(plan: "pro" | "pro_heavy" = "pro"): number {
  const e = PLAN_ENTITLEMENTS[plan];
  return Math.round(e.priceMonthly * 12 - e.priceYearly);
}

export function upgradeCopy(reason: UpgradeReason): {
  title: string;
  message: string;
  bullets: string[];
} {
  const save = yearlySavingsUsd("pro");
  const commonBullets = [
    "Unlimited coach playbooks",
    "Annual vehicle health report",
    "Custom profile tags + maintenance history",
    "Voice coaching + more tokens",
  ];

  switch (reason) {
    case "playbook":
      return {
        title: "You've used your 5 free playbooks",
        message:
          "Free includes 5 coach guide starts every 30 days from your signup date. Upgrade for unlimited DIY guides — cancel anytime.",
        bullets: commonBullets,
      };
    case "annual":
      return {
        title: "Annual Health Report is Pro",
        message:
          "Get a full yearly vehicle health PDF — scorecard, DTCs, 12-month service history, and coach next steps for your car.",
        bullets: [
          "Full annual health PDF",
          "Unlimited coach playbooks",
          "Custom profile tags",
          `Save $${save}/yr on annual Pro`,
        ],
      };
    case "history":
      return {
        title: "Full maintenance history is Pro",
        message:
          "Free shows a short preview. Upgrade to keep your complete service log across vehicles.",
        bullets: commonBullets,
      };
    case "tags":
      return {
        title: "Custom profile tags are Pro",
        message:
          "Tag vehicles as Modified, Tow, Classic, EV, or Daily Driver so Coach Guides personalize recommendations.",
        bullets: [
          "Custom profile tags",
          "Smarter coach recommendations",
          "Annual health report",
          `Annual Pro from $${PRO.priceYearly}/yr`,
        ],
      };
    case "voice":
      return {
        title: "Voice coaching is Pro",
        message:
          "Hands-free mic input and auto-read coaching steps unlock on Pro.",
        bullets: commonBullets,
      };
    case "photo":
      return {
        title: "Daily photo limit reached",
        message:
          "Free includes a small daily photo-diagnose cap. Pro unlocks unlimited photo diagnoses.",
        bullets: commonBullets,
      };
    case "tokens":
      return {
        title: "Token quota running low",
        message:
          "Upgrade to Pro for a larger monthly token pool — or top up anytime.",
        bullets: commonBullets,
      };
    case "vehicles":
      return {
        title: "Vehicle limit reached",
        message:
          "Free includes 1 vehicle. Pro supports up to 5 so your whole garage stays covered.",
        bullets: commonBullets,
      };
    default:
      return {
        title: "Upgrade to keep going",
        message:
          "Unlock unlimited coach guides, annual reports, custom tags, and voice coaching. Cancel anytime.",
        bullets: commonBullets,
      };
  }
}
