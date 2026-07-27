import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import {
  evaluateServiceDue,
  formatReminderPushBody,
  type ReminderVehicleInput,
} from "@/lib/reminders";

export const runtime = "nodejs";

/**
 * Vercel / external cron entry for maintenance reminders.
 * Auth: Authorization: Bearer $CRON_SECRET
 *
 * Prefer this on Vercel; Supabase Edge Function is the alternate deployer.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase service role not configured" },
      { status: 500 },
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY?.trim();
  const vapidSubject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:support@garagegenius.cloud";
  const canPush = Boolean(vapidPublic && vapidPrivate);
  if (canPush) {
    webpush.setVapidDetails(vapidSubject, vapidPublic!, vapidPrivate!);
  }

  const resendKey = process.env.RESEND_API_KEY?.trim();
  const fromEmail =
    process.env.REMINDER_FROM_EMAIL?.trim() || "reminders@garagegenius.cloud";

  const { data: vehicles, error } = await admin
    .from("user_vehicles")
    .select(
      "id, user_id, year, make, model, mileage, last_maintenance, market",
    )
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let emailed = 0;
  let pushed = 0;
  let skipped = 0;

  for (const row of vehicles || []) {
    const input: ReminderVehicleInput = {
      id: row.id,
      year: row.year,
      make: row.make,
      model: row.model,
      mileage: row.mileage ?? 0,
      last_maintenance: row.last_maintenance,
      market: row.market,
    };

    // Enrich with latest maintenance_records mileage when present
    const { data: lastRec } = await admin
      .from("maintenance_records")
      .select("mileage, performed_at")
      .eq("vehicle_id", row.id)
      .order("performed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastRec?.mileage != null) {
      input.last_service_mileage = lastRec.mileage;
    }
    if (!input.last_maintenance && lastRec?.performed_at) {
      input.last_maintenance = lastRec.performed_at;
    }

    const due = evaluateServiceDue(input);
    if (!due.due || !due.reason) {
      skipped += 1;
      continue;
    }

    const msg = formatReminderPushBody(input, due.reason);

    // --- Email (Resend) ---
    if (resendKey) {
      const { data: profile } = await admin
        .from("profiles")
        .select("email")
        .eq("id", row.user_id)
        .maybeSingle();

      const email = profile?.email;
      if (email) {
        const already = await admin
          .from("reminder_deliveries")
          .select("id")
          .eq("vehicle_id", row.id)
          .eq("channel", "email")
          .gte("sent_at", new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (!already.data?.length) {
          const sendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${resendKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: fromEmail,
              to: email,
              subject: msg.title,
              text: msg.body,
            }),
          });
          if (sendRes.ok) {
            await admin.from("reminder_deliveries").insert({
              user_id: row.user_id,
              vehicle_id: row.id,
              channel: "email",
              reason: due.reason,
              title: msg.title,
              body: msg.body,
            });
            emailed += 1;
          }
        }
      }
    }

    // --- Web Push ---
    if (canPush) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("endpoint, p256dh, auth")
        .eq("user_id", row.user_id);

      if (subs?.length) {
        const already = await admin
          .from("reminder_deliveries")
          .select("id")
          .eq("vehicle_id", row.id)
          .eq("channel", "web_push")
          .gte("sent_at", new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (!already.data?.length) {
          let anyOk = false;
          for (const sub of subs) {
            try {
              await webpush.sendNotification(
                {
                  endpoint: sub.endpoint,
                  keys: { p256dh: sub.p256dh, auth: sub.auth },
                },
                JSON.stringify(msg),
              );
              anyOk = true;
            } catch (err) {
              console.warn("[reminders] push failed", err);
            }
          }
          if (anyOk) {
            await admin.from("reminder_deliveries").insert({
              user_id: row.user_id,
              vehicle_id: row.id,
              channel: "web_push",
              reason: due.reason,
              title: msg.title,
              body: msg.body,
            });
            pushed += 1;
          }
        }
      }
    }
  }

  return NextResponse.json({
    success: true,
    checked: vehicles?.length ?? 0,
    emailed,
    pushed,
    skipped,
  });
}
