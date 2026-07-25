-- ONE-SHOT: paste into Supabase SQL Editor (requires user_vehicles from 010).
-- Fixes ERROR 42P17: functions in index expression must be marked IMMUTABLE
-- (caused by sent_at::date on timestamptz).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_unique unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

create table if not exists public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.user_vehicles (id) on delete cascade,
  channel text not null
    check (channel in ('web_push', 'email', 'in_app')),
  reason text,
  title text,
  body text,
  sent_at timestamptz not null default now(),
  read_at timestamptz
);

alter table public.reminder_deliveries
  add column if not exists read_at timestamptz;

create index if not exists reminder_deliveries_vehicle_sent_idx
  on public.reminder_deliveries (vehicle_id, sent_at desc);

create index if not exists reminder_deliveries_user_sent_idx
  on public.reminder_deliveries (user_id, sent_at desc);

create index if not exists reminder_deliveries_user_unread_idx
  on public.reminder_deliveries (user_id, sent_at desc)
  where read_at is null;

drop index if exists reminder_deliveries_daily_unique;
create unique index if not exists reminder_deliveries_daily_unique
  on public.reminder_deliveries (
    vehicle_id,
    channel,
    (timezone('UTC', sent_at)::date)
  );

alter table public.push_subscriptions enable row level security;
alter table public.reminder_deliveries enable row level security;

drop policy if exists "Users own push select" on public.push_subscriptions;
create policy "Users own push select"
  on public.push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users own push insert" on public.push_subscriptions;
create policy "Users own push insert"
  on public.push_subscriptions for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users own push update" on public.push_subscriptions;
create policy "Users own push update"
  on public.push_subscriptions for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users own push delete" on public.push_subscriptions;
create policy "Users own push delete"
  on public.push_subscriptions for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users own reminder_deliveries select" on public.reminder_deliveries;
create policy "Users own reminder_deliveries select"
  on public.reminder_deliveries for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users own reminder_deliveries update" on public.reminder_deliveries;
create policy "Users own reminder_deliveries update"
  on public.reminder_deliveries for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
