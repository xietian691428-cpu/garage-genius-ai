import { NextResponse, type NextRequest } from "next/server";
import {
  isProPlanCookie,
  PLAN_COOKIE,
  pricingUrlForReason,
  SOFT_GATED_APP_TABS,
} from "@/lib/subscription-guard";

/**
 * Soft subscription paywall (cookie-based).
 *
 * Auth remains AuthGate (Supabase session is localStorage — not visible here).
 * Client writes `gg_plan` when useSubscription resolves. Soft-gated tabs
 * (SOFT_GATED_APP_TABS) redirect Free users to /pricing — History is preview
 * (not soft-gated). Hard gates live in API routes.
 */
export function middleware(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // Never block public marketing, legal, auth, webhooks, or admin login
  if (
    pathname.startsWith("/api/stripe") ||
    pathname.startsWith("/admin/login") ||
    pathname === "/" ||
    pathname.startsWith("/pricing") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth")
  ) {
    return NextResponse.next();
  }

  const plan = request.cookies.get(PLAN_COOKIE)?.value;
  const isPro = isProPlanCookie(plan);

  // Soft-gate Pro-only app tabs when cookie says free
  if (pathname.startsWith("/app") && !isPro) {
    const tab = searchParams.get("tab");
    if (tab && tab in SOFT_GATED_APP_TABS) {
      const reason = SOFT_GATED_APP_TABS[tab];
      const url = request.nextUrl.clone();
      url.pathname = "/pricing";
      url.search = new URL(pricingUrlForReason(reason), request.url).search;
      return NextResponse.redirect(url);
    }
  }

  // Coach APIs: do not soft-block here — playbook-session enforces quota / auth
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/api/coach/:path*"],
};
