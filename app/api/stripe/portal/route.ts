import { NextRequest, NextResponse } from "next/server";
import { getStripe } from "@/lib/stripe";
import {
  createSupabaseAdmin,
  createSupabaseUserClient,
} from "@/lib/supabase-admin";
import {
  isQaUnlockEnabled,
  qaPaymentDisabledMessage,
} from "@/lib/qa-mode";

export const runtime = "nodejs";

function getAccessToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length).trim() || null;
}

function appBaseUrl(req: NextRequest): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    req.nextUrl.origin ??
    "http://localhost:3000"
  );
}

export async function POST(req: NextRequest) {
  try {
    if (isQaUnlockEnabled()) {
      return NextResponse.json(
        { error: qaPaymentDisabledMessage() },
        { status: 503 },
      );
    }

    const token = getAccessToken(req);
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userClient = createSupabaseUserClient(token);
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createSupabaseAdmin();
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      return NextResponse.json(
        { error: profileError.message },
        { status: 500 },
      );
    }

    if (!profile?.stripe_customer_id) {
      return NextResponse.json(
        { error: "No Stripe customer on file. Subscribe first." },
        { status: 400 },
      );
    }

    const baseUrl = appBaseUrl(req);
    const session = await getStripe().billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${baseUrl}/?billing=portal`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Portal failed";
    console.error("Stripe portal error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
