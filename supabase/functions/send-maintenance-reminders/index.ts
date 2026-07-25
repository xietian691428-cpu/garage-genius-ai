/**
 * Supabase Edge Function — send-maintenance-reminders
 *
 * Why this differs from a naive Next.js import sketch:
 * - Deno Edge cannot import `lib/reminders.ts` (Next path aliases / Node modules).
 *   Due rules are inlined to match `evaluateServiceDue` in lib/reminders.ts.
 * - Do NOT use `vehicle_vitals.snapshot_at` as last service (that's photo/OBD).
 *   Use `user_vehicles.last_maintenance` + `maintenance_records`.
 * - There is no `notifications` table — write `reminder_deliveries`
 *   (channel: email | in_app) and send email via Resend.
 * - Web Push (VAPID) runs on Next `/api/cron/maintenance-reminders` (Node web-push).
 *
 * Deploy:
 *   supabase functions deploy send-maintenance-reminders
 * Cron (Dashboard → Schedules): e.g. 0 14 * * *  (daily 14:00 UTC)
 *
 * Secrets: RESEND_API_KEY, REMINDER_FROM_EMAIL, optional CRON_SECRET
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

type VehicleRow = {
  id: string;
  user_id: string;
  year: number;
  make: string;
  model: string;
  mileage: number | null;
  last_maintenance: string | null;
  market: string | null;
};

/** Mirrors lib/reminders.ts evaluateServiceDue (Deno-safe copy). */
function shouldRemindService(input: {
  mileage: number;
  last_maintenance: string | null;
  last_service_mileage: number | null;
}): { due: boolean; reason: string | null } {
  const now = Date.now();
  if (input.last_maintenance) {
    const t = Date.parse(input.last_maintenance);
    if (!Number.isNaN(t)) {
      const days = Math.floor((now - t) / (24 * 60 * 60 * 1000));
      if (days > 180) {
        return {
          due: true,
          reason: `Last recorded service was ${days} days ago`,
        };
      }
    }
  }

  if (
    input.last_service_mileage != null &&
    input.mileage - input.last_service_mileage > 5000
  ) {
    const delta = input.mileage - input.last_service_mileage;
    return {
      due: true,
      reason: `${delta.toLocaleString()} miles since last service`,
    };
  }

  if (!input.mileage) return { due: false, reason: null };
  const milesToWindow = Math.max(200, 5000 - (input.mileage % 5000));
  if (milesToWindow <= 800) {
    return {
      due: true,
      reason: `About ${milesToWindow} miles to next service window`,
    };
  }
  return { due: false, reason: null };
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (cronSecret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${cronSecret}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  const fromEmail =
    Deno.env.get("REMINDER_FROM_EMAIL") || "reminders@garagegenius.ai";

  const { data: vehicles, error } = await supabase
    .from("user_vehicles")
    .select(
      "id, user_id, year, make, model, mileage, last_maintenance, market",
    )
    .limit(2000);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let emailed = 0;
  let logged = 0;
  let skipped = 0;

  for (const v of (vehicles || []) as VehicleRow[]) {
    // Latest DIY service log (not vehicle_vitals)
    const { data: lastRec } = await supabase
      .from("maintenance_records")
      .select("mileage, performed_at")
      .eq("vehicle_id", v.id)
      .order("performed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const due = shouldRemindService({
      mileage: v.mileage ?? 0,
      last_maintenance: v.last_maintenance || lastRec?.performed_at || null,
      last_service_mileage: lastRec?.mileage ?? null,
    });

    if (!due.due || !due.reason) {
      skipped += 1;
      continue;
    }

    const title = `Maintenance for ${v.make} ${v.model}`;
    const body = due.reason || "Oil change due soon";

    // Spam guard — one reminder cycle per vehicle per ~20h
    const { data: already } = await supabase
      .from("reminder_deliveries")
      .select("id")
      .eq("vehicle_id", v.id)
      .gte(
        "sent_at",
        new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString(),
      )
      .limit(1);

    if (already?.length) {
      skipped += 1;
      continue;
    }

    // Always log in_app delivery for history / future inbox UI
    const { error: inAppErr } = await supabase
      .from("reminder_deliveries")
      .insert({
        user_id: v.user_id,
        vehicle_id: v.id,
        channel: "in_app",
        reason: due.reason,
        title,
        body,
      });
    if (inAppErr) {
      console.error("[reminders] in_app log failed", inAppErr.message);
      skipped += 1;
      continue;
    }
    logged += 1;

    if (!resendKey) {
      skipped += 1;
      continue;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", v.user_id)
      .maybeSingle();

    if (!profile?.email) {
      skipped += 1;
      continue;
    }

    const sendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: profile.email,
        subject: `Garage Genius — ${title}`,
        text: `Your ${v.year} ${v.make} ${v.model}: ${body}`,
      }),
    });

    if (!sendRes.ok) {
      console.error("[reminders] resend failed", await sendRes.text());
      continue;
    }

    await supabase.from("reminder_deliveries").insert({
      user_id: v.user_id,
      vehicle_id: v.id,
      channel: "email",
      reason: due.reason,
      title,
      body,
    });
    emailed += 1;
  }

  return new Response(
    JSON.stringify({
      success: true,
      checked: vehicles?.length ?? 0,
      emailed,
      logged,
      skipped,
      note:
        "Web Push: use Next POST /api/cron/maintenance-reminders with VAPID keys.",
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
