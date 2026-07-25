/**
 * Admin console navigation — 5 top-level modules (PC ops backend).
 */

export type AdminRole = "super_admin" | "ops" | "support";

export type AdminModuleId =
  | "home"
  | "business"
  | "ops"
  | "knowledge"
  | "customers"
  | "staff";

export type AdminNavItem = {
  href: string;
  label: string;
  module: AdminModuleId;
  /** Exact match for home */
  exact?: boolean;
};

export type AdminNavGroup = {
  id: AdminModuleId;
  label: string;
  items: AdminNavItem[];
};

/** Modules each role may access (home always allowed when logged in). */
export const ADMIN_ROLE_MODULES: Record<AdminRole, AdminModuleId[]> = {
  super_admin: ["home", "business", "ops", "knowledge", "customers", "staff"],
  ops: ["home", "business", "ops", "knowledge", "customers"],
  support: ["home", "business", "customers"],
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "home",
    label: "主页",
    items: [{ href: "/admin", label: "数据面板", module: "home", exact: true }],
  },
  {
    id: "business",
    label: "业务管理",
    items: [
      {
        href: "/admin/business/playbooks",
        label: "Coach / Playbook 记录",
        module: "business",
      },
      {
        href: "/admin/business/chats",
        label: "对话记录",
        module: "business",
      },
    ],
  },
  {
    id: "ops",
    label: "运营管理",
    items: [
      { href: "/admin/ops", label: "运营总览", module: "ops" },
      { href: "/admin/ops/tokens", label: "Token 用量", module: "ops" },
      { href: "/admin/ops/revenue", label: "收入与会员", module: "ops" },
      {
        href: "/admin/ops/refunds",
        label: "退款审批",
        module: "ops",
      },
    ],
  },
  {
    id: "knowledge",
    label: "AI 知识库",
    items: [
      { href: "/admin/knowledge", label: "知识条目", module: "knowledge" },
      {
        href: "/admin/knowledge/ingest",
        label: "扩充 / 上传",
        module: "knowledge",
      },
      {
        href: "/admin/knowledge/compare",
        label: "对比测试",
        module: "knowledge",
      },
      { href: "/admin/parts", label: "联属配件", module: "knowledge" },
    ],
  },
  {
    id: "customers",
    label: "客户管理",
    items: [
      { href: "/admin/customers", label: "客户列表", module: "customers" },
    ],
  },
  {
    id: "staff",
    label: "用户管理",
    items: [
      { href: "/admin/staff", label: "后台账号", module: "staff" },
      { href: "/admin/staff/audit", label: "操作日志", module: "staff" },
    ],
  },
];
