/**
 * Customer CRM — profiles + vehicles + subscription + notes/tags.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";

export type CustomerListItem = {
  id: string;
  email: string | null;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  createdAt: string;
  tags: string[];
  notes: string | null;
  archivedAt: string | null;
  vehicleCount: number;
};

export type CustomerDetail = CustomerListItem & {
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  vehicles: Array<{
    id: string;
    year: number | null;
    make: string | null;
    model: string | null;
    mileage: number | null;
    market: string | null;
    archived: boolean;
  }>;
  recentTokens: number;
  playbookRuns: number;
};

export async function listCustomers(options: {
  q?: string;
  status?: string;
  archived?: "include" | "only" | "exclude";
  limit?: number;
}): Promise<{ customers: CustomerListItem[]; total: number }> {
  const admin = createSupabaseAdmin();
  const limit = Math.min(options.limit ?? 100, 300);

  let query = admin
    .from("profiles")
    .select(
      "id, email, subscription_status, trial_ends_at, created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (options.status?.trim()) {
    query = query.eq("subscription_status", options.status.trim());
  }
  if (options.q?.trim()) {
    query = query.ilike("email", `%${options.q.trim()}%`);
  }

  const { data: profiles, error, count } = await query;
  if (error) throw error;

  const ids = (profiles ?? []).map((p) => p.id as string);
  const crmByUser = new Map<
    string,
    { tags: string[]; notes: string | null; archived_at: string | null }
  >();
  const vehicleCount = new Map<string, number>();

  if (ids.length) {
    const [crmRes, vehRes] = await Promise.all([
      admin.from("customer_crm").select("user_id, tags, notes, archived_at").in("user_id", ids),
      admin.from("user_vehicles").select("user_id").in("user_id", ids),
    ]);
    for (const c of crmRes.data ?? []) {
      crmByUser.set(c.user_id as string, {
        tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
        notes: (c.notes as string) ?? null,
        archived_at: (c.archived_at as string) ?? null,
      });
    }
    for (const v of vehRes.data ?? []) {
      const uid = v.user_id as string;
      vehicleCount.set(uid, (vehicleCount.get(uid) || 0) + 1);
    }
  }

  const archivedMode = options.archived ?? "exclude";
  let customers: CustomerListItem[] = (profiles ?? []).map((p) => {
    const crm = crmByUser.get(p.id as string);
    return {
      id: p.id as string,
      email: (p.email as string) ?? null,
      subscriptionStatus: p.subscription_status as string,
      trialEndsAt: (p.trial_ends_at as string) ?? null,
      createdAt: p.created_at as string,
      tags: crm?.tags ?? [],
      notes: crm?.notes ?? null,
      archivedAt: crm?.archived_at ?? null,
      vehicleCount: vehicleCount.get(p.id as string) || 0,
    };
  });

  if (archivedMode === "exclude") {
    customers = customers.filter((c) => !c.archivedAt);
  } else if (archivedMode === "only") {
    customers = customers.filter((c) => Boolean(c.archivedAt));
  }

  return { customers, total: count ?? customers.length };
}

export async function getCustomerDetail(
  userId: string,
): Promise<CustomerDetail | null> {
  const admin = createSupabaseAdmin();
  const { data: profile, error } = await admin
    .from("profiles")
    .select(
      "id, email, subscription_status, trial_ends_at, created_at, stripe_customer_id, stripe_subscription_id, current_period_end",
    )
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!profile) return null;

  const [crmRes, vehRes, tokenRes, playbookRes] = await Promise.all([
    admin
      .from("customer_crm")
      .select("tags, notes, archived_at")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("user_vehicles")
      .select("id, year, make, model, mileage, market, archived_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    admin
      .from("token_usage_events")
      .select("total_tokens")
      .eq("user_id", userId)
      .gte(
        "created_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      )
      .limit(5000),
    admin
      .from("coach_playbook_usage")
      .select("run_count")
      .eq("user_id", userId),
  ]);

  const crm = crmRes.data;
  const recentTokens = (tokenRes.data ?? []).reduce(
    (s, r) => s + (Number(r.total_tokens) || 0),
    0,
  );
  const playbookRuns = (playbookRes.data ?? []).reduce(
    (s, r) => s + (Number(r.run_count) || 0),
    0,
  );

  return {
    id: profile.id as string,
    email: (profile.email as string) ?? null,
    subscriptionStatus: profile.subscription_status as string,
    trialEndsAt: (profile.trial_ends_at as string) ?? null,
    createdAt: profile.created_at as string,
    stripeCustomerId: (profile.stripe_customer_id as string) ?? null,
    stripeSubscriptionId: (profile.stripe_subscription_id as string) ?? null,
    currentPeriodEnd: (profile.current_period_end as string) ?? null,
    tags: Array.isArray(crm?.tags) ? (crm!.tags as string[]) : [],
    notes: (crm?.notes as string) ?? null,
    archivedAt: (crm?.archived_at as string) ?? null,
    vehicleCount: (vehRes.data ?? []).length,
    vehicles: (vehRes.data ?? []).map((v) => ({
      id: v.id as string,
      year: typeof v.year === "number" ? v.year : null,
      make: (v.make as string) ?? null,
      model: (v.model as string) ?? null,
      mileage: typeof v.mileage === "number" ? v.mileage : null,
      market: (v.market as string) ?? null,
      archived: Boolean(v.archived_at),
    })),
    recentTokens,
    playbookRuns,
  };
}

export async function updateCustomerCrm(
  userId: string,
  patch: {
    tags?: string[];
    notes?: string | null;
    archived?: boolean;
  },
): Promise<void> {
  const admin = createSupabaseAdmin();
  const row: Record<string, unknown> = {
    user_id: userId,
    updated_at: new Date().toISOString(),
  };
  if (patch.tags) row.tags = patch.tags;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.archived === true) row.archived_at = new Date().toISOString();
  if (patch.archived === false) row.archived_at = null;

  const { error } = await admin.from("customer_crm").upsert(row, {
    onConflict: "user_id",
  });
  if (error) throw error;

  await admin.from("admin_audit_logs").insert({
    actor_email: "admin",
    action: "customer_crm_update",
    module: "customers",
    target_type: "user",
    target_id: userId,
    detail: patch,
  });
}
