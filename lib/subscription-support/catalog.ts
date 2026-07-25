/**
 * Production subscription-support playbooks (coach tone, EN).
 */

import type { SupportScenario } from "@/lib/types/subscription-support";
import {
  SUPPORT_DISCLAIMER,
  SUPPORT_DISCLAIMER_FULL,
} from "@/lib/types/subscription-support";

const ux = {
  max_action_buttons: 2,
  enforce_risk_confirm_modal: true,
  require_human_for_refund: true as const,
  safety_disclaimer_default: SUPPORT_DISCLAIMER,
  show_progress_bar: true,
  locale: "en-US" as const,
};

export const SUPPORT_SCENARIOS: Record<
  SupportScenario["slug"],
  SupportScenario
> = {
  billing_renewal_failed: {
    id: "support_renewal_failed_v1",
    slug: "billing_renewal_failed",
    title: "Renewal / payment failed",
    subtitle: "Fix a past-due charge and restore Pro access",
    icon: "alert",
    entry_step_id: "intro",
    ux_rules: ux,
    steps: [
      {
        id: "intro",
        title: "Let's get your renewal sorted",
        coach_encourage: "You're not alone — card declines happen all the time.",
        description:
          "When a renewal fails, Stripe marks the subscription past due and retries. We'll check your status, then walk you through updating the card in the secure Stripe portal — we never ask for card numbers inside this chat.",
        personalize:
          "Plan on file: {{plan_label}}. Status: {{status}}. {{past_due_hint}}",
        trust_nudge:
          "Transparent tip: fixing the card usually restores access within minutes after Stripe succeeds.",
        safety_disclaimer: SUPPORT_DISCLAIMER,
        progress: { index: 1, total: 3, percent: 20, label: "Step 1 of 3" },
        action_buttons: [
          {
            id: "check",
            label: "Check my billing status",
            style: "primary",
            action: "refresh_status",
            next_step_id: "fix",
          },
          {
            id: "skip",
            label: "I already know it's past due",
            style: "secondary",
            action: "goto",
            next_step_id: "fix",
          },
        ],
      },
      {
        id: "fix",
        title: "Update your payment method",
        coach_encourage: "One secure portal hop — then you're back coaching.",
        description:
          "We'll open Stripe's Customer Portal focused on payment methods. Update the default card, then return here. If the invoice is still open, Stripe will retry automatically.",
        safety_warning:
          "Only enter card details on Stripe's hosted page (stripe.com), never in Garage Genius forms.",
        safety_disclaimer: SUPPORT_DISCLAIMER,
        progress: { index: 2, total: 3, percent: 60, label: "Step 2 of 3" },
        action_buttons: [
          {
            id: "portal_pm",
            label: "Open Stripe · update card",
            style: "primary",
            action: "open_portal_payment_method",
          },
          {
            id: "done",
            label: "I've updated it",
            style: "secondary",
            action: "goto",
            next_step_id: "wrap",
          },
        ],
      },
      {
        id: "wrap",
        title: "You're set — give Stripe a moment",
        coach_encourage: "Nice work. We'll keep Pro features unlocked once payment clears.",
        description:
          "Refresh status after a minute. If it still shows past due, open Manage billing for invoices or start a refund conversation only if you were charged incorrectly.",
        safety_disclaimer: SUPPORT_DISCLAIMER,
        progress: { index: 3, total: 3, percent: 100, label: "Done" },
        action_buttons: [
          {
            id: "refresh",
            label: "Refresh status",
            style: "primary",
            action: "refresh_status",
          },
          {
            id: "finish",
            label: "Done",
            style: "secondary",
            action: "mark_done",
          },
        ],
      },
    ],
    completion: {
      title: "Renewal coach complete",
      coach_encourage: "You've got this — billing hiccups are fixable.",
      description:
        "If Pro isn't restored after a successful card update, check invoices in Stripe Portal or message us from Settings.",
    },
  },

  billing_update_payment: {
    id: "support_update_payment_v1",
    slug: "billing_update_payment",
    title: "Update payment method",
    subtitle: "Change card or default payment in Stripe Portal",
    icon: "card",
    entry_step_id: "intro",
    ux_rules: ux,
    steps: [
      {
        id: "intro",
        title: "Update how you pay",
        coach_encourage: "Quick, secure, and fully under your control.",
        description:
          "Garage Genius never stores full card numbers. Stripe Customer Portal lets you add a card, set the default, and remove old methods.",
        personalize: "Signed in as {{email}}. Current plan: {{plan_label}}.",
        safety_disclaimer: SUPPORT_DISCLAIMER,
        progress: { index: 1, total: 2, percent: 40, label: "Step 1 of 2" },
        action_buttons: [
          {
            id: "open",
            label: "Open Stripe · payment methods",
            style: "primary",
            action: "open_portal_payment_method",
          },
          {
            id: "general",
            label: "Open full billing portal",
            style: "secondary",
            action: "open_portal",
          },
        ],
      },
      {
        id: "confirm",
        title: "All set?",
        description:
          "After saving in Stripe, your next renewal uses the new default method. You can return anytime from Settings → Billing help.",
        safety_disclaimer: SUPPORT_DISCLAIMER,
        progress: { index: 2, total: 2, percent: 100, label: "Done" },
        action_buttons: [
          {
            id: "done",
            label: "Done",
            style: "primary",
            action: "mark_done",
          },
        ],
      },
    ],
    completion: {
      title: "Payment method guide complete",
      description: "Your card updates live in Stripe. We only see a masked brand/last4 when available.",
    },
  },

  billing_refund_request: {
    id: "support_refund_request_v1",
    slug: "billing_refund_request",
    title: "Request a refund",
    subtitle: "Human review required — we never auto-refund",
    icon: "refund",
    entry_step_id: "intro",
    ux_rules: ux,
    steps: [
      {
        id: "intro",
        title: "Refunds need a human teammate",
        coach_encourage: "We'll be transparent every step — no surprises.",
        description:
          "Policy: refunds are never automated. You'll pick a recent charge, confirm with your account email, and we queue a request for Garage Genius staff. You'll keep access until a human decides.",
        trust_nudge:
          "Why the extra step? Card refunds move real money — Stripe + our team must both approve.",
        safety_disclaimer: SUPPORT_DISCLAIMER_FULL,
        progress: { index: 1, total: 4, percent: 15, label: "Step 1 of 4" },
        action_buttons: [
          {
            id: "continue",
            label: "I understand — continue",
            style: "primary",
            action: "goto",
            next_step_id: "pick",
          },
          {
            id: "cancel_instead",
            label: "I meant to cancel instead",
            style: "secondary",
            action: "goto",
            next_step_id: "redirect_cancel",
          },
        ],
      },
      {
        id: "redirect_cancel",
        title: "Cancel is a different path",
        description:
          "Canceling stops future renewals; refunding returns a past charge. Use Cancel subscription guide if you want to stop billing.",
        safety_disclaimer: SUPPORT_DISCLAIMER,
        progress: { index: 2, total: 4, percent: 40, label: "Redirect" },
        action_buttons: [
          {
            id: "back",
            label: "Back to refund",
            style: "primary",
            action: "goto",
            next_step_id: "pick",
          },
          {
            id: "done",
            label: "Close for now",
            style: "secondary",
            action: "mark_done",
          },
        ],
      },
      {
        id: "pick",
        title: "Choose the charge to review",
        description:
          "We'll load recent paid invoices from Stripe. Pick one, then verify your email. Staff will see amount, invoice id, and your note.",
        personalize: "Account: {{email}} · Plan: {{plan_label}}",
        safety_disclaimer: SUPPORT_DISCLAIMER_FULL,
        progress: { index: 2, total: 4, percent: 45, label: "Step 2 of 4" },
        action_buttons: [
          {
            id: "load",
            label: "Load recent invoices",
            style: "primary",
            action: "open_invoices",
            next_step_id: "submit",
          },
        ],
      },
      {
        id: "submit",
        title: "Submit for human review",
        coach_encourage: "Almost there — double-check before you send.",
        description:
          "Secondary verification: type your account email exactly. Then confirm the risk dialog. This queues a refund request — it does NOT move money yet.",
        safety_warning:
          "No automatic refunds. Approval happens only in Admin after a person reviews.",
        require_secondary_verify: true,
        risk_confirm: {
          required: true,
          title: "Queue refund for human review?",
          body: "This does not refund immediately. A Garage Genius admin must approve before Stripe refunds the charge.",
          checkbox_label: "I understand a human must approve before any refund",
          confirm_label: "Queue refund request",
          cancel_label: "Not now",
          risk_level: "critical",
          disclaimer: SUPPORT_DISCLAIMER_FULL,
          require_email_verify: true,
        },
        safety_disclaimer: SUPPORT_DISCLAIMER_FULL,
        progress: { index: 3, total: 4, percent: 75, label: "Step 3 of 4" },
        action_buttons: [
          {
            id: "request",
            label: "Queue refund request",
            style: "danger",
            action: "request_refund",
            next_step_id: "queued",
          },
          {
            id: "abort",
            label: "Cancel",
            style: "secondary",
            action: "mark_done",
          },
        ],
      },
      {
        id: "queued",
        title: "Request queued",
        coach_encourage: "Thanks for your patience — we'll review carefully.",
        description:
          "Your refund request is pending_human. You'll see status updates in email/Stripe once processed. Continue using the app; access isn't removed by this request alone.",
        safety_disclaimer: SUPPORT_DISCLAIMER,
        progress: { index: 4, total: 4, percent: 100, label: "Queued" },
        action_buttons: [
          {
            id: "done",
            label: "Done",
            style: "primary",
            action: "mark_done",
          },
        ],
      },
    ],
    completion: {
      title: "Refund request submitted",
      coach_encourage: "Human review protects both of you.",
      description:
        "Admins process requests at /admin/support-refunds. You'll be notified when Stripe completes or rejects the refund.",
    },
  },

  billing_invoice_resend: {
    id: "support_invoice_resend_v1",
    slug: "billing_invoice_resend",
    title: "Invoices & receipts",
    subtitle: "Open or resend a recent Stripe invoice",
    icon: "invoice",
    entry_step_id: "intro",
    ux_rules: ux,
    steps: [
      {
        id: "intro",
        title: "Need a receipt?",
        coach_encourage: "Happy to help you grab the paperwork.",
        description:
          "Stripe hosts invoice PDFs and customer portal history. We can list recent invoices, open the hosted page, or ask Stripe to email an open invoice again.",
        personalize: "We'll look up invoices for {{email}}.",
        safety_disclaimer: SUPPORT_DISCLAIMER,
        progress: { index: 1, total: 2, percent: 40, label: "Step 1 of 2" },
        action_buttons: [
          {
            id: "list",
            label: "Show recent invoices",
            style: "primary",
            action: "open_invoices",
            next_step_id: "actions",
          },
          {
            id: "portal",
            label: "Open Stripe invoice history",
            style: "secondary",
            action: "open_portal",
          },
        ],
      },
      {
        id: "actions",
        title: "Open or resend",
        description:
          "Pick an invoice below (shown in the assistant panel). Open PDF/hosted link, or resend if Stripe still allows emailing that invoice.",
        safety_disclaimer: SUPPORT_DISCLAIMER,
        progress: { index: 2, total: 2, percent: 100, label: "Step 2 of 2" },
        action_buttons: [
          {
            id: "resend",
            label: "Resend selected invoice email",
            style: "primary",
            action: "resend_invoice",
          },
          {
            id: "done",
            label: "Done",
            style: "secondary",
            action: "mark_done",
          },
        ],
      },
    ],
    completion: {
      title: "Invoice help complete",
      description: "You can always reopen Billing help from Settings.",
    },
  },

  billing_cancel_guide: {
    id: "support_cancel_guide_v1",
    slug: "billing_cancel_guide",
    title: "Cancel subscription",
    subtitle: "Cancel at period end via Stripe Portal",
    icon: "cancel",
    entry_step_id: "intro",
    ux_rules: ux,
    steps: [
      {
        id: "intro",
        title: "Before you cancel",
        coach_encourage: "No hard feelings — we'll make this clear and easy.",
        description:
          "Canceling stops future renewals. You typically keep Pro until {{period_end}}. This guide opens Stripe's cancel flow — we don't cancel silently in the background.",
        personalize:
          "Plan: {{plan_label}}. Current period ends: {{period_end}}.",
        trust_nudge: "You can resubscribe anytime from Pricing.",
        safety_disclaimer: SUPPORT_DISCLAIMER,
        progress: { index: 1, total: 3, percent: 25, label: "Step 1 of 3" },
        action_buttons: [
          {
            id: "continue",
            label: "Continue to cancel options",
            style: "primary",
            action: "goto",
            next_step_id: "confirm",
          },
          {
            id: "keep",
            label: "Keep my plan",
            style: "secondary",
            action: "mark_done",
          },
        ],
      },
      {
        id: "confirm",
        title: "Confirm in Stripe Portal",
        description:
          "Secondary check: cancel is irreversible for the current period once confirmed in Stripe (you keep access until period end if cancel-at-period-end is selected).",
        require_secondary_verify: true,
        risk_confirm: {
          required: true,
          title: "Open Stripe cancel flow?",
          body: "You'll confirm cancellation on Stripe's secure page. We recommend cancel at period end so you keep Pro until {{period_end}}.",
          checkbox_label: "I understand cancel is managed in Stripe Portal",
          confirm_label: "Open cancel in Stripe",
          cancel_label: "Stay subscribed",
          risk_level: "high",
          disclaimer: SUPPORT_DISCLAIMER_FULL,
          require_email_verify: true,
        },
        safety_disclaimer: SUPPORT_DISCLAIMER_FULL,
        progress: { index: 2, total: 3, percent: 65, label: "Step 2 of 3" },
        action_buttons: [
          {
            id: "portal_cancel",
            label: "Open Stripe · cancel",
            style: "danger",
            action: "open_portal_cancel",
            next_step_id: "wrap",
          },
          {
            id: "abort",
            label: "Keep subscription",
            style: "secondary",
            action: "mark_done",
          },
        ],
      },
      {
        id: "wrap",
        title: "After you cancel",
        coach_encourage: "Thanks for trying Garage Genius.",
        description:
          "When Stripe confirms cancel-at-period-end, Pro continues until the date shown. Free limits apply afterward. Come back anytime — Pricing is one tap away.",
        safety_disclaimer: SUPPORT_DISCLAIMER,
        progress: { index: 3, total: 3, percent: 100, label: "Done" },
        action_buttons: [
          {
            id: "pricing",
            label: "View plans",
            style: "secondary",
            action: "open_pricing",
          },
          {
            id: "done",
            label: "Done",
            style: "primary",
            action: "mark_done",
          },
        ],
      },
    ],
    completion: {
      title: "Cancel guide complete",
      description:
        "If you changed your mind, reopen Stripe Portal and remove the cancellation before the period ends.",
    },
  },
};

export function listSupportScenarios(): SupportScenario[] {
  return Object.values(SUPPORT_SCENARIOS);
}

export function getSupportScenario(
  slug: string,
): SupportScenario | null {
  return SUPPORT_SCENARIOS[slug as SupportScenario["slug"]] ?? null;
}
