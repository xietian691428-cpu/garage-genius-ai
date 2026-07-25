import { NextRequest, NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/admin-auth";
import {
  getCustomerDetail,
  listCustomers,
  updateCustomerCrm,
} from "@/lib/admin-customers";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const userId = sp.get("userId")?.trim();

  try {
    if (userId) {
      const customer = await getCustomerDetail(userId);
      if (!customer) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ customer });
    }

    const data = await listCustomers({
      q: sp.get("q") || undefined,
      status: sp.get("status") || undefined,
      archived: (sp.get("archived") as "include" | "only" | "exclude") || "exclude",
      limit: Number(sp.get("limit") || 100) || 100,
    });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[/api/admin/customers]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to load customers",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as {
      userId?: string;
      tags?: string[];
      notes?: string | null;
      archived?: boolean;
    };
    if (!body.userId?.trim()) {
      return NextResponse.json({ error: "userId required" }, { status: 400 });
    }
    await updateCustomerCrm(body.userId.trim(), {
      tags: body.tags,
      notes: body.notes,
      archived: body.archived,
    });
    const customer = await getCustomerDetail(body.userId.trim());
    return NextResponse.json({ ok: true, customer });
  } catch (err) {
    console.error("[/api/admin/customers PATCH]", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Failed to update customer",
      },
      { status: 500 },
    );
  }
}
