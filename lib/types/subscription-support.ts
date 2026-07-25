/**
 * Subscription Support Coach — billing help playbooks (Stripe).
 * Mirrors DIY CoachScenario shape with billing-specific actions.
 */

export type SupportRiskLevel = "medium" | "high" | "critical";

export type SupportAction =
  | "goto"
  | "mark_done"
  | "open_portal"
  | "open_portal_payment_method"
  | "open_portal_cancel"
  | "open_invoices"
  | "resend_invoice"
  | "request_refund"
  | "refresh_status"
  | "open_pricing"
  | "custom";

export type SupportActionButton = {
  id: string;
  label: string;
  style: "primary" | "secondary" | "ghost" | "danger";
  action: SupportAction;
  /** goto target, portal hint, or custom payload */
  payload?: string;
  next_step_id?: string;
  set_flags?: Record<string, string | boolean | number>;
};

export type SupportRiskConfirm = {
  required: true;
  title: string;
  body: string;
  checkbox_label: string;
  confirm_label: string;
  cancel_label: string;
  risk_level: SupportRiskLevel;
  disclaimer?: string;
  /** Require typing account email before confirm */
  require_email_verify?: boolean;
};

export type SupportStep = {
  id: string;
  title: string;
  description: string;
  coach_encourage?: string;
  personalize?: string;
  action_buttons: SupportActionButton[];
  safety_disclaimer: string;
  trust_nudge?: string | null;
  safety_warning?: string | null;
  risk_confirm?: SupportRiskConfirm | null;
  /** Secondary verify before running action (refund / cancel) */
  require_secondary_verify?: boolean;
  progress?: {
    index: number;
    total: number;
    label?: string;
    percent?: number;
  };
};

export type SupportScenarioSlug =
  | "billing_renewal_failed"
  | "billing_update_payment"
  | "billing_refund_request"
  | "billing_invoice_resend"
  | "billing_cancel_guide";

export type SupportScenario = {
  id: string;
  slug: SupportScenarioSlug;
  title: string;
  subtitle: string;
  icon: "alert" | "card" | "refund" | "invoice" | "cancel";
  entry_step_id: string;
  ux_rules: {
    max_action_buttons: number;
    enforce_risk_confirm_modal: boolean;
    require_human_for_refund: true;
    safety_disclaimer_default: string;
    show_progress_bar: boolean;
    locale: "en-US";
  };
  steps: SupportStep[];
  completion: {
    title: string;
    description: string;
    coach_encourage?: string;
  };
};

export type SupportRequestKind =
  | "refund"
  | "invoice_resend"
  | "cancel_help"
  | "payment_update"
  | "renewal_failed";

export type SupportRequestStatus =
  | "pending_human"
  | "approved"
  | "rejected"
  | "completed"
  | "canceled";

export type SupportInvoiceSummary = {
  id: string;
  number: string | null;
  status: string | null;
  amountPaid: number;
  currency: string;
  created: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  chargeId: string | null;
};

export type SupportBillingStatus = {
  email: string | null;
  hasCustomer: boolean;
  customerId: string | null;
  subscriptionId: string | null;
  status: string | null;
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  planLabel: string;
  tier: string;
  pastDue: boolean;
  past_due_hint: string;
  defaultPaymentMethod: string | null;
  invoices: SupportInvoiceSummary[];
};

export const SUPPORT_DISCLAIMER =
  "Billing guidance only. Stripe processes payments. Refunds require human review before money moves.";

export const SUPPORT_DISCLAIMER_FULL =
  "Garage Genius billing coach explains options clearly. Sensitive actions (refunds) are queued for a human teammate — we never auto-refund. Payment method and cancel flows open the secure Stripe Customer Portal.";
