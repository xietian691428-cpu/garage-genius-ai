import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import ShopReportDocument from "@/components/shop-report/ShopReportDocument";
import {
  isShopReportExpired,
  toPublicShopReportPayload,
} from "@/lib/shop-report/public-view";
import type { ShopReportPayload } from "@/lib/types/shop-report";

export const runtime = "nodejs";

type Props = { params: Promise<{ token: string }> };

export default async function PublicShopReportPage({ params }: Props) {
  const { token } = await params;
  const publicToken = (token || "").trim();

  if (!publicToken || publicToken.length < 16) {
    return <ExpiredOrMissing kind="missing" />;
  }

  let payload: ShopReportPayload | null = null;
  let expired = false;
  let reportId: string | null = null;

  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("shop_reports")
      .select("payload, expires_at, report_code")
      .eq("public_token", publicToken)
      .maybeSingle();

    if (error || !data) {
      return <ExpiredOrMissing kind="missing" />;
    }

    reportId = data.report_code as string;
    if (isShopReportExpired(data.expires_at as string | null)) {
      expired = true;
    } else {
      payload = toPublicShopReportPayload(data.payload as ShopReportPayload);
    }
  } catch {
    return <ExpiredOrMissing kind="missing" />;
  }

  if (expired || !payload) {
    return <ExpiredOrMissing kind="expired" reportId={reportId} />;
  }

  return (
    <div className="min-h-dvh bg-[#f8fafc] px-4 py-8 sm:px-8">
      <div className="mx-auto mb-6 flex max-w-2xl items-center justify-between gap-3">
        <Link
          href="/"
          className="text-sm font-medium text-cyan-700 hover:underline"
        >
          Garage Genius AI
        </Link>
        <p className="text-[11px] text-slate-500">
          Read-only shop handoff · expires in 30 days from creation
        </p>
      </div>
      <div
        data-testid="shop-report-public"
        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8"
      >
        <ShopReportDocument payload={payload} />
      </div>
    </div>
  );
}

function ExpiredOrMissing({
  kind,
  reportId,
}: {
  kind: "expired" | "missing";
  reportId?: string | null;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0a0f1c] px-4">
      <div
        data-testid="shop-report-public-error"
        className="w-full max-w-md rounded-3xl border border-slate-700 bg-[#111827] p-6 text-center"
      >
        <p className="text-sm font-medium text-cyan-400">Garage Genius AI</p>
        <h1 className="mt-2 text-xl font-semibold text-white">
          {kind === "expired" ? "Link expired" : "Report not found"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {kind === "expired"
            ? "This shop handoff link is no longer available. Share links are valid for 30 days. Ask the vehicle owner to generate a new report from Garage Genius."
            : "We couldn’t find a shop report for this link. It may have been deleted or the URL is incomplete."}
        </p>
        {reportId ? (
          <p className="mt-2 text-xs text-slate-500">Report #{reportId}</p>
        ) : null}
        <Link
          href="/"
          className="mt-6 inline-block rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-cyan-400"
        >
          Go to Garage Genius
        </Link>
      </div>
    </div>
  );
}
