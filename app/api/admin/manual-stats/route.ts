import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import { getManualStats } from "@/lib/admin-manual-stats";

export const runtime = "nodejs";

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await getManualStats());
  } catch (err) {
    console.error("[/api/admin/manual-stats]", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load manual stats",
      },
      { status: 500 },
    );
  }
}
