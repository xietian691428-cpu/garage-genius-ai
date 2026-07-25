import { supabase } from "@/lib/supabase";
import type {
  BillingInterval,
  CheckoutSelection,
  PaidPlan,
} from "@/lib/types/subscription";

async function authHeaders(): Promise<HeadersInit> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error("Sign in to manage your subscription.");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

export async function startCheckout(
  selection: CheckoutSelection | BillingInterval = {
    plan: "pro",
    interval: "monthly",
  },
) {
  const body: CheckoutSelection =
    typeof selection === "string"
      ? { plan: "pro", interval: selection }
      : selection;

  const res = await fetch("/api/stripe/checkout", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Unable to start checkout.");
  }

  window.location.assign(data.url);
}

export async function startPlanCheckout(
  plan: PaidPlan,
  interval: BillingInterval = "monthly",
) {
  return startCheckout({ plan, interval });
}

export async function openBillingPortal() {
  const res = await fetch("/api/stripe/portal", {
    method: "POST",
    headers: await authHeaders(),
  });

  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Unable to open billing portal.");
  }

  window.location.assign(data.url);
}

/** One-time token pack checkout → Stripe hosted page. */
export async function startTokenRecharge(tokens: number, priceUsd: number) {
  const res = await fetch("/api/stripe/recharge", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ tokens, price: priceUsd }),
  });

  const data = (await res.json()) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.error ?? "Unable to start token recharge.");
  }

  window.location.assign(data.url);
}
