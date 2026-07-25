/**
 * Dashboard notification inbox — backed by reminder_deliveries
 * (not a separate `notifications` table).
 */

import { supabase } from "@/lib/supabase";

export type ReminderInboxItem = {
  id: string;
  vehicle_id: string;
  channel: "web_push" | "email" | "in_app";
  title: string | null;
  body: string | null;
  reason: string | null;
  sent_at: string;
  read_at: string | null;
};

export async function listReminderInbox(
  vehicleId?: string | null,
  limit = 12,
): Promise<ReminderInboxItem[]> {
  let query = supabase
    .from("reminder_deliveries")
    .select(
      "id, vehicle_id, channel, title, body, reason, sent_at, read_at",
    )
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (vehicleId) {
    query = query.eq("vehicle_id", vehicleId);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[reminder-inbox]", error.message);
    return [];
  }
  return (data || []) as ReminderInboxItem[];
}

export async function markReminderRead(id: string): Promise<boolean> {
  const { error } = await supabase
    .from("reminder_deliveries")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);
  if (error) {
    console.warn("[reminder-inbox] mark read", error.message);
    return false;
  }
  return true;
}

export async function markAllRemindersRead(
  vehicleId?: string | null,
): Promise<void> {
  let query = supabase
    .from("reminder_deliveries")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null);
  if (vehicleId) {
    query = query.eq("vehicle_id", vehicleId);
  }
  const { error } = await query;
  if (error) console.warn("[reminder-inbox] mark all", error.message);
}
