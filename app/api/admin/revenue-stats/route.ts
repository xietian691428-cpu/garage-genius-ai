import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getAdminRevenueStats } from "@/lib/admin-revenue-stats";

export const runtime = "nodejs";

/** Admin-only revenue KPIs (MRR, ARPU, paid users). */
export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await getAdminRevenueStats();
    return NextResponse.json(stats);
  } catch (err) {
    console.error("[/api/admin/revenue-stats]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load revenue stats",
      },
      { status: 500 },
    );
  }
}
