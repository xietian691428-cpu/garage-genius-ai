import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SubscriptionStatus } from "@/lib/types/subscription";
import { planFromPriceId } from "@/lib/stripe-prices";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

/** Service-role client for Stripe webhooks / server-side billing updates. */
export function createSupabaseAdmin(): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

/** User-scoped client from a Supabase access token (Bearer). */
export function createSupabaseUserClient(accessToken: string): SupabaseClient {
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

export function mapStripeStatus(
  status: string | null | undefined,
  priceId?: string | null,
): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active": {
      const paid = planFromPriceId(priceId);
      return paid === "pro_heavy" ? "pro_heavy" : "pro";
    }
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "canceled";
    default:
      return "free";
  }
}
