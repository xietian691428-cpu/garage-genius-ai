import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getOpsOverview, type OpsRange } from "@/lib/admin-ops-stats";

export const runtime = "nodejs";

function parseRange(raw: string | null): OpsRange {
  return raw === "30d" ? "30d" : "7d";
}

/** Admin homepage KPIs + trend series. */
export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const range = parseRange(req.nextUrl.searchParams.get("range"));
    const data = await getOpsOverview(range);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/admin/ops-overview]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load ops overview",
      },
      { status: 500 },
    );
  }
}
