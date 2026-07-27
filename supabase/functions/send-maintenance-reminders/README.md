# send-maintenance-reminders

Daily maintenance due check for Garage Genius.

## Do not paste the Next.js sketch as-is

| Sketch | Actual |
|--------|--------|
| `import { shouldRemindService } from '../../../lib/reminders'` | Deno cannot import Next `@/` modules — rules are **inlined** (same as `evaluateServiceDue`) |
| `vitals:vehicle_vitals(*)` for due date | **Wrong** — use `last_maintenance` + `maintenance_records` |
| `notifications` table | Use **`reminder_deliveries`** (`017` + `019` for `read_at` inbox) |
| Firebase only | Edge sends **Resend email** + `in_app` log; Web Push via Next cron |

## Deploy

```bash
supabase functions deploy send-maintenance-reminders
supabase secrets set RESEND_API_KEY=re_xxx REMINDER_FROM_EMAIL=reminders@garagegenius.cloud
# optional:
supabase secrets set CRON_SECRET=your-long-secret
```

Schedule in Supabase Dashboard (Edge Functions → Schedules), e.g. `0 14 * * *`.

If `CRON_SECRET` is set, call with:

`Authorization: Bearer <CRON_SECRET>`

Dashboard Notifications panel lists `reminder_deliveries` for the active vehicle.
Web Push: `NEXT_PUBLIC_VAPID_*` + Next `POST /api/cron/maintenance-reminders`.
