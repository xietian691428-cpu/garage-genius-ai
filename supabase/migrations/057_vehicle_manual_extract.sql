-- Staging oil extracts from private manuals + garage source tags.
-- Candidates are never global RAG. Confirm is required before garage writes.

alter table public.user_vehicles
  add column if not exists oil_capacity_source text;

alter table public.user_vehicles
  add column if not exists oil_viscosity_source text;

alter table public.user_vehicles
  add column if not exists oil_specs_confirmed_at timestamptz;

alter table public.user_vehicles
  drop constraint if exists user_vehicles_oil_capacity_source_check;
alter table public.user_vehicles
  add constraint user_vehicles_oil_capacity_source_check
  check (
    oil_capacity_source is null
    or oil_capacity_source in ('user_entered', 'vcdb', 'user_manual_confirmed')
  );

alter table public.user_vehicles
  drop constraint if exists user_vehicles_oil_viscosity_source_check;
alter table public.user_vehicles
  add constraint user_vehicles_oil_viscosity_source_check
  check (
    oil_viscosity_source is null
    or oil_viscosity_source in ('user_entered', 'vcdb', 'user_manual_confirmed')
  );

comment on column public.user_vehicles.oil_capacity_source is
  'How oil_capacity was set: user_entered, vcdb, or user_manual_confirmed after owner confirm.';
comment on column public.user_vehicles.oil_viscosity_source is
  'How oil_viscosity was set: user_entered, vcdb, or user_manual_confirmed after owner confirm.';
comment on column public.user_vehicles.oil_specs_confirmed_at is
  'When the owner last confirmed manual-extracted oil fields for this vehicle.';

create table if not exists public.vehicle_manual_extract_candidates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.user_vehicles (id) on delete cascade,
  manual_id uuid not null references public.vehicle_manuals (id) on delete cascade,
  field text not null check (field in ('viscosity', 'capacity')),
  value text not null,
  unit text,
  excerpt text,
  page_from integer,
  page_to integer,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'superseded')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists vehicle_manual_extract_one_pending_field_idx
  on public.vehicle_manual_extract_candidates (user_id, vehicle_id, field)
  where status = 'pending';

create index if not exists vehicle_manual_extract_vehicle_idx
  on public.vehicle_manual_extract_candidates (user_id, vehicle_id, status);

alter table public.vehicle_manual_extract_candidates enable row level security;

drop policy if exists vehicle_manual_extract_select_own
  on public.vehicle_manual_extract_candidates;
create policy vehicle_manual_extract_select_own
  on public.vehicle_manual_extract_candidates for select
  using (auth.uid() = user_id);

drop policy if exists vehicle_manual_extract_insert_own
  on public.vehicle_manual_extract_candidates;
create policy vehicle_manual_extract_insert_own
  on public.vehicle_manual_extract_candidates for insert
  with check (auth.uid() = user_id);

drop policy if exists vehicle_manual_extract_update_own
  on public.vehicle_manual_extract_candidates;
create policy vehicle_manual_extract_update_own
  on public.vehicle_manual_extract_candidates for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists vehicle_manual_extract_delete_own
  on public.vehicle_manual_extract_candidates;
create policy vehicle_manual_extract_delete_own
  on public.vehicle_manual_extract_candidates for delete
  using (auth.uid() = user_id);

comment on table public.vehicle_manual_extract_candidates is
  'Heuristic oil field guesses from a private owner manual. Not truth until the owner confirms.';
