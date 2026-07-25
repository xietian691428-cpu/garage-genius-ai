"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  CreditCard,
  ExternalLink,
  Shield,
} from "lucide-react";
import type {
  SupportActionButton,
  SupportBillingStatus,
  SupportScenario,
} from "@/lib/types/subscription-support";
import { supabase } from "@/lib/supabase";

type Props = {
  scenario: SupportScenario;
  status: SupportBillingStatus | null;
  selectedInvoiceId: string | null;
  onClose: () => void;
  onRefreshStatus: () => Promise<void>;
  onStatusMessage: (msg: string | null) => void;
};

function inject(text: string, status: SupportBillingStatus | null): string {
  const period = status?.periodEnd
    ? new Date(status.periodEnd).toLocaleDateString()
    : "the end of your billing period";
  return text
    .replaceAll("{{email}}", status?.email || "your account")
    .replaceAll("{{plan_label}}", status?.planLabel || "Free")
    .replaceAll("{{status}}", status?.status || "unknown")
    .replaceAll("{{past_due_hint}}", status?.past_due_hint || "")
    .replaceAll("{{period_end}}", period);
}

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Sign in required");
  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

export default function SubscriptionSupportCoach({
  scenario,
  status,
  selectedInvoiceId,
  onClose,
  onRefreshStatus,
  onStatusMessage,
}: Props) {
  const [stepId, setStepId] = useState(
    scenario.entry_step_id || scenario.steps[0]?.id,
  );
  const [flags, setFlags] = useState<Record<string, unknown>>({});
  const [riskOpen, setRiskOpen] = useState(false);
  const [riskChecked, setRiskChecked] = useState(false);
  const [emailVerify, setEmailVerify] = useState("");
  const [pendingBtn, setPendingBtn] = useState<SupportActionButton | null>(
    null,
  );
  const [completed, setCompleted] = useState(false);
  const [busy, setBusy] = useState(false);

  const step = useMemo(
    () => scenario.steps.find((s) => s.id === stepId) ?? scenario.steps[0],
    [scenario.steps, stepId],
  );
  const maxBtns = scenario.ux_rules.max_action_buttons ?? 2;
  const buttons = (step.action_buttons || []).slice(0, maxBtns);
  const percent = step.progress?.percent ?? 0;

  function goToStep(next: string) {
    setStepId(next);
    setRiskOpen(false);
    setPendingBtn(null);
    setRiskChecked(false);
    setEmailVerify("");
  }

  async function openPortal(
    flow: "default" | "payment_method_update" | "subscription_cancel",
  ) {
    setBusy(true);
    onStatusMessage(null);
    try {
      const res = await fetch("/api/stripe/support/portal", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ flow }),
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) throw new Error(json.error || "Portal failed");
      window.location.assign(json.url);
    } catch (err) {
      onStatusMessage(err instanceof Error ? err.message : "Portal failed");
      setBusy(false);
    }
  }

  async function runAction(btn: SupportActionButton) {
    if (btn.set_flags) setFlags((f) => ({ ...f, ...btn.set_flags }));

    switch (btn.action) {
      case "goto":
        goToStep(btn.next_step_id || btn.payload || stepId);
        break;
      case "mark_done":
        setCompleted(true);
        break;
      case "refresh_status":
        setBusy(true);
        try {
          await onRefreshStatus();
          onStatusMessage("Status refreshed from Stripe.");
          if (btn.next_step_id) goToStep(btn.next_step_id);
        } finally {
          setBusy(false);
        }
        break;
      case "open_portal":
        await openPortal("default");
        break;
      case "open_portal_payment_method":
        await openPortal("payment_method_update");
        break;
      case "open_portal_cancel":
        await openPortal("subscription_cancel");
        if (btn.next_step_id) goToStep(btn.next_step_id);
        break;
      case "open_invoices":
        await onRefreshStatus();
        onStatusMessage(
          status?.invoices?.length
            ? `Loaded ${status.invoices.length} invoice(s). Select one in the panel, then continue.`
            : "No invoices found yet.",
        );
        if (btn.next_step_id) goToStep(btn.next_step_id);
        break;
      case "open_pricing":
        window.location.assign("/pricing?from=billing_support");
        break;
      case "resend_invoice": {
        if (!selectedInvoiceId) {
          onStatusMessage("Select an invoice first.");
          return;
        }
        setBusy(true);
        try {
          const res = await fetch("/api/stripe/support/invoice-resend", {
            method: "POST",
            headers: await authHeaders(),
            body: JSON.stringify({ invoiceId: selectedInvoiceId }),
          });
          const json = (await res.json()) as {
            error?: string;
            mode?: string;
            url?: string | null;
          };
          if (!res.ok) throw new Error(json.error || "Resend failed");
          onStatusMessage(
            json.mode === "emailed"
              ? "Stripe emailed the invoice (if still open)."
              : "Opened hosted invoice / PDF link.",
          );
          if (json.url) window.open(json.url, "_blank", "noopener,noreferrer");
        } catch (err) {
          onStatusMessage(
            err instanceof Error ? err.message : "Invoice resend failed",
          );
        } finally {
          setBusy(false);
        }
        break;
      }
      case "request_refund": {
        if (!selectedInvoiceId) {
          onStatusMessage("Select a paid invoice before queuing a refund.");
          return;
        }
        setBusy(true);
        try {
          const res = await fetch("/api/stripe/support/refund-request", {
            method: "POST",
            headers: await authHeaders(),
            body: JSON.stringify({
              invoiceId: selectedInvoiceId,
              verifyEmail: emailVerify,
              reason: "Requested via Subscription Support Coach",
              clientSessionId:
                typeof sessionStorage !== "undefined"
                  ? sessionStorage.getItem("gg_support_session") ||
                    (() => {
                      const id = crypto.randomUUID();
                      sessionStorage.setItem("gg_support_session", id);
                      return id;
                    })()
                  : undefined,
            }),
          });
          const json = (await res.json()) as {
            error?: string;
            requestId?: string;
            message?: string;
          };
          if (!res.ok) throw new Error(json.error || "Queue failed");
          onStatusMessage(
            json.message ||
              `Queued for human review (${json.requestId?.slice(0, 8)}…)`,
          );
          if (btn.next_step_id) goToStep(btn.next_step_id);
          else setCompleted(true);
        } catch (err) {
          onStatusMessage(
            err instanceof Error ? err.message : "Refund request failed",
          );
        } finally {
          setBusy(false);
        }
        break;
      }
      default:
        break;
    }
  }

  function onPress(btn: SupportActionButton) {
    const needsRisk =
      scenario.ux_rules.enforce_risk_confirm_modal &&
      step.risk_confirm?.required &&
      (btn.style === "primary" ||
        btn.style === "danger" ||
        btn.action === "request_refund" ||
        btn.action === "open_portal_cancel") &&
      !flags[`risk_ack_${step.id}`];

    if (needsRisk) {
      setPendingBtn(btn);
      setRiskChecked(false);
      setEmailVerify("");
      setRiskOpen(true);
      return;
    }
    void runAction(btn);
  }

  function confirmRisk() {
    if (!riskChecked || !pendingBtn) return;
    if (step.risk_confirm?.require_email_verify) {
      const expected = status?.email?.trim().toLowerCase() || "";
      if (!expected || emailVerify.trim().toLowerCase() !== expected) {
        onStatusMessage("Type your account email exactly to continue.");
        return;
      }
    }
    setFlags((f) => ({ ...f, [`risk_ack_${step.id}`]: true }));
    setRiskOpen(false);
    const btn = pendingBtn;
    setPendingBtn(null);
    void runAction(btn);
  }

  if (completed) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#0a0f1c] px-4 py-6">
        <div className="mx-auto w-full max-w-lg space-y-4">
          <h2 className="text-2xl font-bold text-white">
            {scenario.completion.title}
          </h2>
          {scenario.completion.coach_encourage && (
            <p className="text-sm text-cyan-300/90">
              {scenario.completion.coach_encourage}
            </p>
          )}
          <p className="text-sm leading-relaxed text-slate-300">
            {inject(scenario.completion.description, status)}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-cyan-500 px-4 py-3.5 text-sm font-semibold text-black"
          >
            Back to billing help
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0a0f1c]">
      <div className="flex shrink-0 items-center gap-2 border-b border-slate-800 px-3 py-2.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl p-2 text-slate-400 hover:bg-slate-900 hover:text-white"
          aria-label="Back"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-cyan-400">
            Billing Support Coach
          </p>
          <p className="truncate text-sm text-slate-200">
            {step.progress?.label || `${percent}% · ${scenario.title}`}
          </p>
        </div>
      </div>

      {scenario.ux_rules.show_progress_bar && (
        <div className="h-1 w-full bg-slate-900">
          <div
            className="h-full bg-cyan-400 transition-all"
            style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
          />
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-lg">
          <div className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-slate-900 via-[#0f172a] to-cyan-950">
            <CreditCard className="h-14 w-14 text-cyan-500/40" />
            <div className="absolute bottom-2 left-2 rounded-lg bg-black/55 px-2 py-1 text-[10px] uppercase tracking-wide text-slate-300">
              Stripe · secure
            </div>
          </div>

          <div className="space-y-3 px-4 py-4">
            <h2 className="text-xl font-bold text-white">{step.title}</h2>
            {step.coach_encourage && (
              <p className="text-sm text-amber-200/90">{step.coach_encourage}</p>
            )}
            {step.personalize && (
              <p className="text-sm text-slate-400">
                {inject(step.personalize, status)}
              </p>
            )}
            <p className="text-sm leading-relaxed text-slate-200">
              {inject(step.description, status)}
            </p>
            {step.trust_nudge && (
              <p className="flex gap-2 rounded-xl border border-slate-700/80 bg-slate-900/40 px-3 py-2 text-xs text-slate-300">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                {step.trust_nudge}
              </p>
            )}
            {step.safety_warning && (
              <p className="flex gap-2 rounded-xl border border-amber-700/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-100">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
                {step.safety_warning}
              </p>
            )}

            <div className="flex flex-col gap-2 pt-1">
              {buttons.map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onPress(btn)}
                  className={`rounded-2xl px-4 py-3.5 text-sm font-semibold transition disabled:opacity-50 ${
                    btn.style === "primary"
                      ? "bg-cyan-500 text-black hover:bg-cyan-400"
                      : btn.style === "danger"
                        ? "border border-red-500/50 bg-red-950/40 text-red-200 hover:bg-red-950/60"
                        : "border border-slate-700 text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  {busy ? "Working…" : btn.label}
                </button>
              ))}
            </div>

            <p className="pb-6 pt-2 text-[11px] leading-relaxed text-slate-500">
              {step.safety_disclaimer ||
                scenario.ux_rules.safety_disclaimer_default}
            </p>
          </div>
        </div>
      </div>

      {riskOpen && step.risk_confirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#0f1524] p-5 shadow-xl">
            <h3 className="text-lg font-bold text-white">
              {step.risk_confirm.title}
            </h3>
            <p className="mt-2 text-sm text-slate-300">
              {inject(step.risk_confirm.body, status)}
            </p>
            <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
              {step.risk_confirm.disclaimer ||
                scenario.ux_rules.safety_disclaimer_default}
            </p>

            {step.risk_confirm.require_email_verify && (
              <label className="mt-4 block text-xs text-slate-400">
                Type your account email to verify
                <input
                  type="email"
                  autoComplete="email"
                  value={emailVerify}
                  onChange={(e) => setEmailVerify(e.target.value)}
                  placeholder={status?.email || "you@example.com"}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white"
                />
              </label>
            )}

            <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-xl border border-slate-700 bg-slate-900/50 px-3 py-3">
              <input
                type="checkbox"
                checked={riskChecked}
                onChange={(e) => setRiskChecked(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-600"
              />
              <span className="text-sm text-slate-200">
                {step.risk_confirm.checkbox_label}
              </span>
            </label>

            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                disabled={!riskChecked || busy}
                onClick={confirmRisk}
                className="rounded-2xl bg-cyan-500 px-4 py-3 text-sm font-semibold text-black disabled:opacity-40"
              >
                {step.risk_confirm.confirm_label}
              </button>
              <button
                type="button"
                onClick={() => {
                  setRiskOpen(false);
                  setPendingBtn(null);
                }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-slate-600 px-4 py-3 text-sm font-medium text-slate-200"
              >
                {step.risk_confirm.cancel_label}
                <ExternalLink className="h-3.5 w-3.5 opacity-60" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
