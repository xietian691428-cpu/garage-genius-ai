import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { listAdminStaff, listAuditLogs } from "@/lib/admin-staff";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const view = req.nextUrl.searchParams.get("view") || "staff";

  try {
    if (view === "audit") {
      const logs = await listAuditLogs(
        Number(req.nextUrl.searchParams.get("limit") || 100) || 100,
      );
      return NextResponse.json({ logs });
    }
    const staff = await listAdminStaff();
    return NextResponse.json({
      staff,
      note: "Bootstrap login still uses ADMIN_EMAIL env; rows in admin_staff are for role planning.",
    });
  } catch (err) {
    console.error("[/api/admin/staff]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load staff",
      },
      { status: 500 },
    );
  }
}
