-- Vehicle vitals snapshots (fluids, DTCs, health) for Dashboard Vision / OBD writeback.
-- References public.user_vehicles (garage), not a separate vehicles table.

create table if not exists public.vehicle_vitals (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.user_vehicles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  fluids jsonb not null default '{}'::jsonb,
  tire_pressure text,
  dtc_codes jsonb not null default '[]'::jsonb,
  health_score integer,
  notes text,
  market text,
  source text not null default 'photo'
    check (source in ('photo', 'obd', 'manual', 'demo', 'system')),
  created_at timestamptz not null default now(),
  constraint vehicle_vitals_health_check
    check (health_score is null or (health_score >= 0 and health_score <= 100))
);

create index if not exists vehicle_vitals_vehicle_snapshot_idx
  on public.vehicle_vitals (vehicle_id, snapshot_at desc);

create index if not exists vehicle_vitals_user_idx
  on public.vehicle_vitals (user_id, snapshot_at desc);

alter table public.vehicle_vitals enable row level security;

drop policy if exists "Users own vitals select" on public.vehicle_vitals;
create policy "Users own vitals select"
  on public.vehicle_vitals
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users own vitals insert" on public.vehicle_vitals;
create policy "Users own vitals insert"
  on public.vehicle_vitals
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users own vitals update" on public.vehicle_vitals;
create policy "Users own vitals update"
  on public.vehicle_vitals
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users own vitals delete" on public.vehicle_vitals;
create policy "Users own vitals delete"
  on public.vehicle_vitals
  for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.vehicle_vitals is
  'Dashboard vitals snapshots from Vision / OBD / manual — per user_vehicles row.';
