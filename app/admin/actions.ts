"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  assertAdminLoginAllowed,
  clearAdminLoginFailures,
  clearAdminSession,
  createAdminSession,
  getRequestIpHint,
  recordAdminLoginFailure,
  requireAdmin,
  verifyAdminCredentials,
} from "@/lib/admin-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  AFFILIATE_PART_CATEGORIES,
  type AffiliatePart,
  type AffiliatePartCategory,
  type AffiliatePartInput,
} from "@/lib/types/affiliate-parts";
import type { KnowledgeEntry, KnowledgeInput } from "@/lib/types/knowledge";

export type ActionResult = {
  ok: boolean;
  error?: string;
};

function emptyToNull(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseOtherUrls(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  return value
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseCategory(value: FormDataEntryValue | null): AffiliatePartCategory {
  const raw = typeof value === "string" ? value : "other";
  return (AFFILIATE_PART_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as AffiliatePartCategory)
    : "other";
}

function parsePartForm(formData: FormData): AffiliatePartInput {
  return {
    oem_number: String(formData.get("oem_number") ?? "").trim(),
    name: String(formData.get("name") ?? "").trim(),
    brand: String(formData.get("brand") ?? "").trim(),
    category: parseCategory(formData.get("category")),
    vehicle_make: emptyToNull(formData.get("vehicle_make")) ?? undefined,
    vehicle_model: emptyToNull(formData.get("vehicle_model")) ?? undefined,
    vehicle_years: emptyToNull(formData.get("vehicle_years")) ?? undefined,
    price_min: parseNumber(formData.get("price_min")),
    price_max: parseNumber(formData.get("price_max")),
    amazon_url: emptyToNull(formData.get("amazon_url")) ?? undefined,
    rockauto_url: emptyToNull(formData.get("rockauto_url")) ?? undefined,
    autozone_url: emptyToNull(formData.get("autozone_url")) ?? undefined,
    oreilly_url: emptyToNull(formData.get("oreilly_url")) ?? undefined,
    other_urls: parseOtherUrls(formData.get("other_urls")),
    notes: emptyToNull(formData.get("notes")) ?? undefined,
    is_active: formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
}

function validatePart(input: AffiliatePartInput): string | null {
  if (!input.oem_number) return "OEM number is required.";
  if (!input.name) return "Part name is required.";
  if (!input.brand) return "Brand is required.";
  return null;
}

export async function adminLoginAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  try {
    assertAdminLoginAllowed(email);

    if (!verifyAdminCredentials(email, password)) {
      recordAdminLoginFailure(email);
      const ip = await getRequestIpHint();
      console.warn("[admin-login] failed", {
        email: email.trim().toLowerCase(),
        ip,
      });
      return {
        ok: false,
        error:
          "Invalid email or password. Use the exact ADMIN_PASSWORD (not the .env escape characters). If your password contains $ or #, set ADMIN_PASSWORD_B64 in .env.local and restart npm run dev.",
      };
    }
    clearAdminLoginFailures(email);
    await createAdminSession();
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Login failed.",
    };
  }
}

export async function adminLogoutAction(): Promise<void> {
  await clearAdminSession();
  redirect("/admin/login");
}

export async function listAffiliateParts(
  query?: string,
): Promise<AffiliatePart[]> {
  await requireAdmin();
  const admin = createSupabaseAdmin();
  let q = admin
    .from("affiliate_parts")
    .select("*")
    .order("updated_at", { ascending: false });

  if (query?.trim()) {
    const safe = query.trim().replace(/[%_,]/g, " ");
    const term = `%${safe}%`;
    q = q.or(
      `oem_number.ilike.${term},name.ilike.${term},brand.ilike.${term},vehicle_make.ilike.${term},vehicle_model.ilike.${term}`,
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as AffiliatePart[];
}

export async function createAffiliatePartAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const input = parsePartForm(formData);
  const validationError = validatePart(input);
  if (validationError) return { ok: false, error: validationError };

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("affiliate_parts").insert({
    oem_number: input.oem_number,
    name: input.name,
    brand: input.brand,
    category: input.category,
    vehicle_make: input.vehicle_make ?? null,
    vehicle_model: input.vehicle_model ?? null,
    vehicle_years: input.vehicle_years ?? null,
    price_min: input.price_min,
    price_max: input.price_max,
    amazon_url: input.amazon_url ?? null,
    rockauto_url: input.rockauto_url ?? null,
    autozone_url: input.autozone_url ?? null,
    oreilly_url: input.oreilly_url ?? null,
    other_urls: input.other_urls ?? [],
    notes: input.notes ?? null,
    is_active: input.is_active ?? true,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/parts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateAffiliatePartAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing part id." };

  const input = parsePartForm(formData);
  const validationError = validatePart(input);
  if (validationError) return { ok: false, error: validationError };

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("affiliate_parts")
    .update({
      oem_number: input.oem_number,
      name: input.name,
      brand: input.brand,
      category: input.category,
      vehicle_make: input.vehicle_make ?? null,
      vehicle_model: input.vehicle_model ?? null,
      vehicle_years: input.vehicle_years ?? null,
      price_min: input.price_min,
      price_max: input.price_max,
      amazon_url: input.amazon_url ?? null,
      rockauto_url: input.rockauto_url ?? null,
      autozone_url: input.autozone_url ?? null,
      oreilly_url: input.oreilly_url ?? null,
      other_urls: input.other_urls ?? [],
      notes: input.notes ?? null,
      is_active: input.is_active ?? true,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/parts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteAffiliatePartAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return { ok: false, error: "Missing part id." };

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("affiliate_parts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/parts");
  revalidatePath("/admin");
  return { ok: true };
}

export async function toggleAffiliatePartActiveAction(
  id: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requireAdmin();
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("affiliate_parts")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/parts");
  return { ok: true };
}

export async function listKnowledgeEntries(
  query?: string,
): Promise<KnowledgeEntry[]> {
  await requireAdmin();
  const admin = createSupabaseAdmin();
  let q = admin
    .from("knowledge_base")
    .select(
      "id, title, content, source, vehicle_make, vehicle_model, vehicle_years, category, metadata, is_active, created_at, updated_at",
    )
    .order("updated_at", { ascending: false });

  if (query?.trim()) {
    const safe = query.trim().replace(/[%_,]/g, " ");
    const term = `%${safe}%`;
    q = q.or(
      `title.ilike.${term},content.ilike.${term},vehicle_make.ilike.${term},vehicle_model.ilike.${term}`,
    );
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as KnowledgeEntry[];
}

function parseKnowledgeForm(formData: FormData): KnowledgeInput {
  return {
    title: String(formData.get("title") ?? "").trim(),
    content: String(formData.get("content") ?? "").trim(),
    source: emptyToNull(formData.get("source")) ?? "manual",
    vehicle_make: emptyToNull(formData.get("vehicle_make")) ?? undefined,
    vehicle_model: emptyToNull(formData.get("vehicle_model")) ?? undefined,
    vehicle_years: emptyToNull(formData.get("vehicle_years")) ?? undefined,
    category: emptyToNull(formData.get("category")) ?? "general",
    is_active:
      formData.get("is_active") === "on" || formData.get("is_active") === "true",
  };
}

export async function createKnowledgeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const input = parseKnowledgeForm(formData);
  if (!input.title) return { ok: false, error: "Title is required." };
  if (!input.content) return { ok: false, error: "Content is required." };

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("knowledge_base").insert({
    title: input.title,
    content: input.content,
    source: input.source ?? "manual",
    vehicle_make: input.vehicle_make ?? null,
    vehicle_model: input.vehicle_model ?? null,
    vehicle_years: input.vehicle_years ?? null,
    category: input.category ?? "general",
    is_active: input.is_active ?? true,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/knowledge");
  revalidatePath("/admin");
  return { ok: true };
}

export async function updateKnowledgeAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Missing knowledge id." };

  const input = parseKnowledgeForm(formData);
  if (!input.title) return { ok: false, error: "Title is required." };
  if (!input.content) return { ok: false, error: "Content is required." };

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("knowledge_base")
    .update({
      title: input.title,
      content: input.content,
      source: input.source ?? "manual",
      vehicle_make: input.vehicle_make ?? null,
      vehicle_model: input.vehicle_model ?? null,
      vehicle_years: input.vehicle_years ?? null,
      category: input.category ?? "general",
      is_active: input.is_active ?? true,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/knowledge");
  return { ok: true };
}

export async function deleteKnowledgeAction(id: string): Promise<ActionResult> {
  await requireAdmin();
  if (!id) return { ok: false, error: "Missing knowledge id." };

  const admin = createSupabaseAdmin();
  const { error } = await admin.from("knowledge_base").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/knowledge");
  revalidatePath("/admin");
  return { ok: true };
}

export async function getAdminDashboardStats() {
  await requireAdmin();
  const admin = createSupabaseAdmin();

  const [parts, knowledge, profiles] = await Promise.all([
    admin.from("affiliate_parts").select("id", { count: "exact", head: true }),
    admin.from("knowledge_base").select("id", { count: "exact", head: true }),
    admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("subscription_status", ["pro", "active", "trialing"]),
  ]);

  return {
    partsCount: parts.count ?? 0,
    knowledgeCount: knowledge.count ?? 0,
    proSubscribers: profiles.count ?? 0,
  };
}
