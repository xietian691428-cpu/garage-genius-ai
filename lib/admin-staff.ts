/**
 * Staff + audit list helpers for 用户管理.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type { AdminRole } from "@/lib/admin-nav";

export type AdminStaffRow = {
  id: string;
  email: string;
  displayName: string | null;
  role: AdminRole;
  isActive: boolean;
  modules: string[];
  createdAt: string;
};

export type AuditLogRow = {
  id: string;
  actorEmail: string | null;
  action: string;
  module: string;
  targetType: string | null;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: string;
};

export async function listAdminStaff(): Promise<AdminStaffRow[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("admin_staff")
    .select(
      "id, email, display_name, role, is_active, modules, created_at",
    )
    .order("created_at", { ascending: false });
  if (error) {
    if (/admin_staff|does not exist|schema cache/i.test(error.message)) {
      return [];
    }
    throw error;
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    email: r.email as string,
    displayName: (r.display_name as string) ?? null,
    role: r.role as AdminRole,
    isActive: Boolean(r.is_active),
    modules: Array.isArray(r.modules) ? (r.modules as string[]) : [],
    createdAt: r.created_at as string,
  }));
}

export async function listAuditLogs(limit = 100): Promise<AuditLogRow[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("admin_audit_logs")
    .select(
      "id, actor_email, action, module, target_type, target_id, detail, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (/admin_audit_logs|does not exist|schema cache/i.test(error.message)) {
      return [];
    }
    throw error;
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    actorEmail: (r.actor_email as string) ?? null,
    action: r.action as string,
    module: r.module as string,
    targetType: (r.target_type as string) ?? null,
    targetId: (r.target_id as string) ?? null,
    detail: (r.detail as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
  }));
}
