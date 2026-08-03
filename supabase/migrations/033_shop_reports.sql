-- Shop Handoff Report archive (Owner Diagnostic Summary PDFs metadata + JSON payload)
create table if not exists public.shop_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid references public.user_vehicles (id) on delete set null,
  report_code text not null,
  source text not null check (source in ('chat', 'coach')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists shop_reports_user_created_idx
  on public.shop_reports (user_id, created_at desc);

create index if not exists shop_reports_vehicle_created_idx
  on public.shop_reports (vehicle_id, created_at desc)
  where vehicle_id is not null;

alter table public.shop_reports enable row level security;

create policy "shop_reports_select_own"
  on public.shop_reports for select
  using (auth.uid() = user_id);

create policy "shop_reports_insert_own"
  on public.shop_reports for insert
  with check (auth.uid() = user_id);

create policy "shop_reports_delete_own"
  on public.shop_reports for delete
  using (auth.uid() = user_id);

comment on table public.shop_reports is
  'Archived Owner Diagnostic Summary (shop handoff) payloads for vehicle profile history.';
