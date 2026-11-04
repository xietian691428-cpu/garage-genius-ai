-- Coolant extract staging (kind=oil|coolant) + garage coolant fields.
-- Incremental on 057 — does not drop oil_* columns.

-- ── Garage confirmed coolant (owner confirm required) ───────────────────────
alter table public.user_vehicles
  add column if not exists coolant_spec_text text;

alter table public.user_vehicles
  add column if not exists coolant_capacity_text text;

alter table public.user_vehicles
  add column if not exists coolant_mix_text text;

alter table public.user_vehicles
  add column if not exists coolant_spec_source text;

alter table public.user_vehicles
  add column if not exists coolant_capacity_source text;

alter table public.user_vehicles
  add column if not exists coolant_mix_source text;

alter table public.user_vehicles
  add column if not exists coolant_specs_confirmed_at timestamptz;

alter table public.user_vehicles
  drop constraint if exists user_vehicles_coolant_spec_source_check;
alter table public.user_vehicles
  add constraint user_vehicles_coolant_spec_source_check
  check (
    coolant_spec_source is null
    or coolant_spec_source in ('user_entered', 'user_manual_confirmed')
  );

alter table public.user_vehicles
  drop constraint if exists user_vehicles_coolant_capacity_source_check;
alter table public.user_vehicles
  add constraint user_vehicles_coolant_capacity_source_check
  check (
    coolant_capacity_source is null
    or coolant_capacity_source in ('user_entered', 'user_manual_confirmed')
  );

alter table public.user_vehicles
  drop constraint if exists user_vehicles_coolant_mix_source_check;
alter table public.user_vehicles
  add constraint user_vehicles_coolant_mix_source_check
  check (
    coolant_mix_source is null
    or coolant_mix_source in ('user_entered', 'user_manual_confirmed')
  );

comment on column public.user_vehicles.coolant_spec_text is
  'Owner-confirmed coolant type/spec phrase from manual or hand entry.';
comment on column public.user_vehicles.coolant_capacity_text is
  'Owner-confirmed coolant capacity text as written (no forced unit conversion).';
comment on column public.user_vehicles.coolant_mix_text is
  'Owner-confirmed mix/concentration only when the manual stated it (e.g. 50/50).';
comment on column public.user_vehicles.coolant_specs_confirmed_at is
  'When the owner last confirmed manual-extracted coolant fields for this vehicle.';

-- ── Candidates: kind + expanded fields ──────────────────────────────────────
alter table public.vehicle_manual_extract_candidates
  add column if not exists kind text not null default 'oil';

alter table public.vehicle_manual_extract_candidates
  drop constraint if exists vehicle_manual_extract_candidates_kind_check;
alter table public.vehicle_manual_extract_candidates
  add constraint vehicle_manual_extract_candidates_kind_check
  check (kind in ('oil', 'coolant'));

-- Expand field check (drop old inline check by recreating constraint name if present)
alter table public.vehicle_manual_extract_candidates
  drop constraint if exists vehicle_manual_extract_candidates_field_check;
alter table public.vehicle_manual_extract_candidates
  add constraint vehicle_manual_extract_candidates_field_check
  check (
    field in (
      'viscosity',
      'capacity',
      'coolant_spec_text',
      'coolant_capacity_text',
      'coolant_mix'
    )
  );

drop index if exists vehicle_manual_extract_one_pending_field_idx;
create unique index if not exists vehicle_manual_extract_one_pending_kind_field_idx
  on public.vehicle_manual_extract_candidates (user_id, vehicle_id, kind, field)
  where status = 'pending';

create index if not exists vehicle_manual_extract_kind_idx
  on public.vehicle_manual_extract_candidates (user_id, vehicle_id, kind, status);

comment on table public.vehicle_manual_extract_candidates is
  'Heuristic oil/coolant field guesses from a private owner manual. Not truth until the owner confirms. kind=oil|coolant.';

comment on column public.vehicle_manual_extract_candidates.kind is
  'oil = engine oil viscosity/capacity; coolant = coolant spec/capacity/mix.';
