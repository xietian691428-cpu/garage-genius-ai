/**
 * Shared admin ops console types (re-exports for consumers).
 */

export type { OpsOverviewResponse, OpsRange } from "@/lib/admin-ops-stats";
export type { OpsFunnelResponse } from "@/lib/admin-ops-funnel";
export type {
  BusinessPlaybookRow,
  BusinessAnalytics,
  ChatThreadSummary,
} from "@/lib/admin-business";
export type {
  CustomerListItem,
  CustomerDetail,
} from "@/lib/admin-customers";
export type { AdminStaffRow, AuditLogRow } from "@/lib/admin-staff";
export type { AdminRole, AdminModuleId } from "@/lib/admin-nav";
