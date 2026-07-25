-- User garage vehicles (multi-car), synced from VCdb picker / manual entry.
-- Replaces browser-only localStorage as source of truth for signed-in users.

create table if not exists public.user_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'My Car',
  year integer not null,
  make text not null,
  model text not null,
  submodel text,
  mileage integer not null default 0,
  engine text not null default 'Unknown',
  transmission text,
  drive_type text,
  brakes text,
  fuel_grade text,
  oil_capacity text,
  oil_viscosity text,
  vin text,
  last_maintenance date,
  notes text,
  tags text[] not null default '{}'::text[],
  /** Full AutoCare VCdb resolved config card (JSON) */
  vcdb jsonb,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_vehicles_year_check check (year >= 1900 and year <= 2100),
  constraint user_vehicles_mileage_check check (mileage >= 0)
);

create index if not exists user_vehicles_user_id_idx
  on public.user_vehicles (user_id);

create index if not exists user_vehicles_user_current_idx
  on public.user_vehicles (user_id, is_current);

-- At most one "current" vehicle per user
create unique index if not exists user_vehicles_one_current_per_user
  on public.user_vehicles (user_id)
  where is_current = true;

create or replace function public.set_user_vehicles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_vehicles_set_updated_at on public.user_vehicles;
create trigger user_vehicles_set_updated_at
  before update on public.user_vehicles
  for each row
  execute function public.set_user_vehicles_updated_at();

/**
 * Ensure only one is_current=true per user when inserting/updating.
 */
create or replace function public.user_vehicles_enforce_single_current()
returns trigger
language plpgsql
as $$
begin
  if new.is_current is true then
    update public.user_vehicles
    set is_current = false
    where user_id = new.user_id
      and id is distinct from new.id
      and is_current = true;
  end if;
  return new;
end;
$$;

drop trigger if exists user_vehicles_single_current on public.user_vehicles;
create trigger user_vehicles_single_current
  before insert or update of is_current
  on public.user_vehicles
  for each row
  when (new.is_current = true)
  execute function public.user_vehicles_enforce_single_current();

alter table public.user_vehicles enable row level security;

drop policy if exists "Users can read own vehicles" on public.user_vehicles;
create policy "Users can read own vehicles"
  on public.user_vehicles
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own vehicles" on public.user_vehicles;
create policy "Users can insert own vehicles"
  on public.user_vehicles
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own vehicles" on public.user_vehicles;
create policy "Users can update own vehicles"
  on public.user_vehicles
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own vehicles" on public.user_vehicles;
create policy "Users can delete own vehicles"
  on public.user_vehicles
  for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.user_vehicles is
  'Per-user garage vehicles with optional VCdb config card (multi-car).';
