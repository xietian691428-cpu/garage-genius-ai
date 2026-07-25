import { NextResponse } from "next/server";
import { getAdminAuthDebugInfo } from "@/lib/admin-auth";

/** Dev helper: GET /api/admin/auth-check — no secrets exposed */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const info = getAdminAuthDebugInfo();
  return NextResponse.json(info);
}
