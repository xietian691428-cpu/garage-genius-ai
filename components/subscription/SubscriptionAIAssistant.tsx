"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CreditCard,
  FileText,
  LifeBuoy,
  Receipt,
  XCircle,
} from "lucide-react";
import {
  getSupportScenario,
  listSupportScenarios,
} from "@/lib/subscription-support/catalog";
import type { SupportScenarioSlug } from "@/lib/types/subscription-support";
import type { SupportBillingStatus } from "@/lib/types/subscription-support";
import SubscriptionSupportCoach from "@/components/subscription/SubscriptionSupportCoach";
import { supabase } from "@/lib/supabase";

const ICONS = {
  alert: AlertCircle,
  card: CreditCard,
  refund: Receipt,
  invoice: FileText,
  cancel: XCircle,
} as const;

type Props = {
  onClose: () => void;
};

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

/**
 * Billing help hub — same full-screen takeover pattern as CoachLibrary.
 * Opens SubscriptionSupportCoach for renewal / payment / refund / invoice / cancel.
 */
export default function SubscriptionAIAssistant({ onClose }: Props) {
  const [activeSlug, setActiveSlug] = useState<SupportScenarioSlug | null>(
    null,
  );
  const [status, setStatus] = useState<SupportBillingStatus | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshStatus = useCallback(async () => {
    const res = await fetch("/api/stripe/support/status", {
      headers: await authHeaders(),
    });
    const json = (await res.json()) as {
      status?: SupportBillingStatus;
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Could not load billing status");
    if (json.status) {
      setStatus(json.status);
      if (
        json.status.invoices.length &&
        !json.status.invoices.some((i) => i.id === selectedInvoiceId)
      ) {
        const paid = json.status.invoices.find((i) => i.status === "paid");
        setSelectedInvoiceId(paid?.id ?? json.status.invoices[0]?.id ?? null);
      }
    }
    return json.status ?? null;
  }, [selectedInvoiceId]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        await refreshStatus();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Load failed");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once
  }, []);

  const scenario = activeSlug ? getSupportScenario(activeSlug) : null;
  const scenarios = listSupportScenarios();

  if (scenario && activeSlug) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {message && (
          <p className="shrink-0 border-b border-slate-800 bg-slate-900/80 px-4 py-2 text-xs text-cyan-200">
            {message}
          </p>
        )}
        <SubscriptionSupportCoach
          scenario={scenario}
          status={status}
          selectedInvoiceId={selectedInvoiceId}
          onClose={() => {
            setActiveSlug(null);
            setMessage(null);
          }}
          onRefreshStatus={async () => {
            await refreshStatus();
          }}
          onStatusMessage={setMessage}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-[#0a0f1c]">
      <div className="mx-auto w-full max-w-lg px-4 py-6">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/20">
              <LifeBuoy className="h-5 w-5 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Billing help</h1>
              <p className="mt-1 text-sm text-slate-400">
                Coach-style guides for renewals, cards, invoices, refunds, and
                cancel — same safety rails as DIY Coach.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
          >
            Close
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-slate-500">Loading Stripe status…</p>
        ) : status ? (
          <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm">
            <p className="font-medium text-white">
              {status.planLabel}{" "}
              <span className="text-slate-400">· {status.status}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">{status.past_due_hint}</p>
            {status.defaultPaymentMethod && (
              <p className="mt-1 text-xs text-slate-400">
                Default: {status.defaultPaymentMethod}
              </p>
            )}
            {status.periodEnd && (
              <p className="mt-1 text-xs text-slate-500">
                Period ends{" "}
                {new Date(status.periodEnd).toLocaleDateString()}
                {status.cancelAtPeriodEnd ? " · cancel scheduled" : ""}
              </p>
            )}
          </div>
        ) : null}

        {message && (
          <p className="mb-4 rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100">
            {message}
          </p>
        )}

        {status && status.invoices.length > 0 && (
          <div className="mb-6">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              Recent invoices
            </p>
            <ul className="space-y-2">
              {status.invoices.map((inv) => {
                const selected = inv.id === selectedInvoiceId;
                const amount = (inv.amountPaid / 100).toFixed(2);
                return (
                  <li key={inv.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedInvoiceId(inv.id)}
                      className={`w-full rounded-2xl border px-3 py-2.5 text-left text-sm transition ${
                        selected
                          ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-100"
                          : "border-slate-800 bg-slate-900/40 text-slate-300 hover:border-slate-600"
                      }`}
                    >
                      <span className="font-medium">
                        {inv.number || inv.id.slice(0, 12)}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        {inv.status} · ${amount} {inv.currency.toUpperCase()} ·{" "}
                        {new Date(inv.created).toLocaleDateString()}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="grid gap-3">
          {scenarios.map((sc) => {
            const Icon = ICONS[sc.icon];
            return (
              <button
                key={sc.slug}
                type="button"
                onClick={() => {
                  setMessage(null);
                  setActiveSlug(sc.slug);
                }}
                className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-left transition hover:border-cyan-500/40 hover:bg-slate-900/80"
              >
                <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800">
                  <Icon className="h-4 w-4 text-cyan-400" />
                </div>
                <h2 className="text-base font-semibold text-white">{sc.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">
                  {sc.subtitle}
                </p>
              </button>
            );
          })}
        </div>

        <p className="mt-8 text-[11px] leading-relaxed text-slate-500">
          Refunds always require human approval before Stripe moves money.
          Payment method and cancel flows open the official Stripe Customer
          Portal — we never collect card numbers here.
        </p>
      </div>
    </div>
  );
}
