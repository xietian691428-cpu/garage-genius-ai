/**
 * Garage Genius AI — app module registry / mount map.
 *
 * Consumed by `/app` (GarageAppPage) to document and assert that production
 * Coach playbooks + paywall + i18n surfaces are wired. Not a separate SPA
 * entry — Next.js App Router owns routing; this is the integration glue.
 *
 * Architecture: Supabase (auth + RAG + feedback) + Stripe (billing) +
 * CoachScenarioPlayer (*_production.json only).
 */

import {
  COACH_PRODUCTION_PLAYBOOKS,
  listCoachPlaybooks,
  type CoachPlaybookSlug,
} from "@/lib/coach-scenarios/catalog";
import { PLAN_ENTITLEMENTS } from "@/lib/types/subscription";
import { APP_LOCALES } from "@/lib/i18n";

/** Expected shippable production playbook count (Phase 1–3). */
export const EXPECTED_PRODUCTION_PLAYBOOK_COUNT = 27;

export type AppTabId =
  | "dashboard"
  | "chat"
  | "coach"
  | "history"
  | "parts"
  | "settings";

/**
 * Tab → primary component mount (see `app/app/page.tsx`).
 * Keep in sync when adding tabs to Sidebar / MobileTabBar.
 */
export const APP_TAB_MOUNTS: Record<
  AppTabId,
  { component: string; notes: string }
> = {
  dashboard: {
    component: "Dashboard",
    notes: "Vitals, Focus Mode, annual health report (Pro), vehicle switcher",
  },
  chat: {
    component: "ChatApp",
    notes: "RAG chat, photo diagnose, voice (Pro), Focus injection",
  },
  coach: {
    component: "CoachLibrary → CoachScenarioPlayer",
    notes:
      "Loads COACH_PRODUCTION_PLAYBOOKS only; quota via /api/coach/playbook-session; step feedback via /api/coach/feedback; risk_confirm gated",
  },
  history: {
    component: "MaintenanceHistory",
    notes: "Free read-only preview (3 rows) + upgrade CTA; Pro full log",
  },
  parts: {
    component: "PartsInventory",
    notes: "Fitment-aware inventory",
  },
  settings: {
    component: "SettingsPanel",
    notes: "LocaleSwitcher (en-US | es), billing portal entry",
  },
};

/** API surfaces the garage app depends on for Coach + billing UX. */
export const APP_API_MOUNTS = {
  playbookSession: "/api/coach/playbook-session",
  coachFeedback: "/api/coach/feedback",
  stripeCheckout: "/api/stripe/checkout",
  stripeWebhook: "/api/stripe/webhook",
  stripePortal: "/api/stripe/portal",
  adminTokenStats: "/api/admin/token-stats",
  adminRevenueStats: "/api/admin/revenue-stats",
} as const;

/** Admin dashboards (cookie session via lib/admin-auth). */
export const ADMIN_MOUNTS = {
  tokenUsage: "/admin/token-usage",
  revenue: "/admin/revenue",
  knowledge: "/admin/knowledge",
  parts: "/admin/parts",
} as const;

export type CoachProductionHealth = {
  ok: boolean;
  playbookCount: number;
  expected: number;
  slugs: CoachPlaybookSlug[];
  freePlaybookLimit: number | null;
  locales: readonly string[];
  riskSafetyNotes: string;
};

/**
 * Call once when mounting the garage shell (client) or in CI.
 * Throws only if production catalog is empty / mismatched — fail loud.
 */
export function assertCoachProductionReady(): CoachProductionHealth {
  const slugs = Object.keys(
    COACH_PRODUCTION_PLAYBOOKS,
  ) as CoachPlaybookSlug[];
  const listed = listCoachPlaybooks();
  const playbookCount = slugs.length;

  if (playbookCount !== EXPECTED_PRODUCTION_PLAYBOOK_COUNT) {
    throw new Error(
      `[bootstrap] Expected ${EXPECTED_PRODUCTION_PLAYBOOK_COUNT} *_production.json playbooks, found ${playbookCount}`,
    );
  }
  if (listed.length !== playbookCount) {
    throw new Error(
      `[bootstrap] listCoachPlaybooks() (${listed.length}) !== catalog (${playbookCount})`,
    );
  }

  // Spot-check: every scenario must keep safety rails (high-risk UX contract)
  for (const slug of slugs) {
    const sc = COACH_PRODUCTION_PLAYBOOKS[slug];
    if (!sc?.ux_rules?.require_safety_disclaimer_every_step) {
      throw new Error(
        `[bootstrap] ${slug}: missing ux_rules.require_safety_disclaimer_every_step`,
      );
    }
    if (!sc.ux_rules?.enforce_risk_confirm_modal) {
      throw new Error(
        `[bootstrap] ${slug}: missing ux_rules.enforce_risk_confirm_modal`,
      );
    }
  }

  return {
    ok: true,
    playbookCount,
    expected: EXPECTED_PRODUCTION_PLAYBOOK_COUNT,
    slugs,
    freePlaybookLimit: PLAN_ENTITLEMENTS.free.playbookRunsPerMonth,
    locales: APP_LOCALES,
    riskSafetyNotes:
      "CoachScenarioPlayer gates primary actions when risk_confirm.required; cancel → Find a shop",
  };
}

/** Dev-only log of mounted modules (no PII). */
export function logAppModuleMount(health?: CoachProductionHealth): void {
  if (typeof process !== "undefined" && process.env.NODE_ENV === "production") {
    return;
  }
  const h = health ?? assertCoachProductionReady();
  console.info(
    `[GarageGenius] modules ready · ${h.playbookCount} production playbooks · Free limit ${h.freePlaybookLimit}/30d · locales ${h.locales.join(",")}`,
  );
}
