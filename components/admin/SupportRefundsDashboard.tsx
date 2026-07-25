"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

type SupportRequest = {
  id: string;
  user_id: string;
  status: string;
  stripe_invoice_id: string | null;
  stripe_charge_id: string | null;
  stripe_refund_id: string | null;
  amount_cents: number;
  currency: string;
  reason: string | null;
  admin_note: string | null;
  created_at: string;
  reviewed_at: string | null;
};

export default function SupportRefundsDashboard() {
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/support-refunds");
        const json = (await res.json()) as {
          requests?: SupportRequest[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || "Load failed");
        setRequests(json.requests ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Load failed");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/support-refunds");
      const json = (await res.json()) as {
        requests?: SupportRequest[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Load failed");
      setRequests(json.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  };

  const act = async (requestId: string, action: "approve" | "reject") => {
    const note =
      action === "approve"
        ? window.prompt("Optional admin note for this refund approval:") ||
          undefined
        : window.prompt("Reason for rejection (optional):") || undefined;

    if (
      action === "approve" &&
      !window.confirm(
        "Approve and execute Stripe refund now? This moves money and cannot be undone from the app.",
      )
    ) {
      return;
    }

    setBusyId(requestId);
    try {
      const res = await fetch("/api/admin/support-refunds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action, note }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Action failed");
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Support refunds</h1>
        <p className="mt-1 text-sm text-slate-400">
          Human review queue from Subscription Support Coach. Approve executes{" "}
          <code className="text-cyan-300">stripe.refunds.create</code> — reject
          leaves money untouched.
        </p>
      </div>

      {error && (
        <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-slate-500">No refund requests yet.</p>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => {
            const amount = (r.amount_cents / 100).toFixed(2);
            const pending = r.status === "pending_human";
            return (
              <li
                key={r.id}
                className="rounded-2xl border border-slate-800 bg-[#111827] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">
                      ${amount} {r.currency.toUpperCase()}{" "}
                      <span className="font-normal text-slate-400">
                        · {r.status}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Invoice {r.stripe_invoice_id || "—"} · Charge{" "}
                      {r.stripe_charge_id || "—"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      User {r.user_id.slice(0, 8)}… ·{" "}
                      {new Date(r.created_at).toLocaleString()}
                    </p>
                    {r.reason && (
                      <p className="mt-2 text-xs text-slate-400">{r.reason}</p>
                    )}
                    {r.stripe_refund_id && (
                      <p className="mt-1 text-xs text-emerald-400">
                        Refund {r.stripe_refund_id}
                      </p>
                    )}
                  </div>
                  {pending && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void act(r.id, "approve")}
                        className="inline-flex items-center gap-1 rounded-xl bg-emerald-500/90 px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        Approve & refund
                      </button>
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void act(r.id, "reject")}
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-600 px-3 py-2 text-xs text-slate-300 disabled:opacity-50"
                      >
                        <X className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
