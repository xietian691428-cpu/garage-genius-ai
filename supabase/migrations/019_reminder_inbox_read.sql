-- Inbox read_at + ensure 017 objects exist.
-- Run after user_vehicles (010). Safe if 017 partially failed.

alter table public.reminder_deliveries
  add column if not exists read_at timestamptz;

-- Fix broken daily unique index from older 017 drafts (sent_at::date)
drop index if exists reminder_deliveries_daily_unique;
create unique index if not exists reminder_deliveries_daily_unique
  on public.reminder_deliveries (
    vehicle_id,
    channel,
    (timezone('UTC', sent_at)::date)
  );

create index if not exists reminder_deliveries_user_unread_idx
  on public.reminder_deliveries (user_id, sent_at desc)
  where read_at is null;

drop policy if exists "Users own reminder_deliveries update" on public.reminder_deliveries;
create policy "Users own reminder_deliveries update"
  on public.reminder_deliveries for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on column public.reminder_deliveries.read_at is
  'When the user marked this reminder as read in the Dashboard inbox.';
