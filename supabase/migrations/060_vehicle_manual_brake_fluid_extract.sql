-- Brake fluid extract staging (kind=brake_fluid) + garage brake fluid fields.
-- Incremental on 059 — does not drop oil_* / coolant_* columns.

-- ── Garage confirmed brake fluid (owner confirm required) ───────────────────
alter table public.user_vehicles
  add column if not exists brake_fluid_spec_text text;

alter table public.user_vehicles
  add column if not exists brake_fluid_notes_text text;

alter table public.user_vehicles
  add column if not exists brake_fluid_spec_source text;

alter table public.user_vehicles
  add column if not exists brake_fluid_notes_source text;

alter table public.user_vehicles
  add column if not exists brake_fluid_specs_confirmed_at timestamptz;

alter table public.user_vehicles
  drop constraint if exists user_vehicles_brake_fluid_spec_source_check;
alter table public.user_vehicles
  add constraint user_vehicles_brake_fluid_spec_source_check
  check (
    brake_fluid_spec_source is null
    or brake_fluid_spec_source in ('user_entered', 'user_manual_confirmed')
  );

alter table public.user_vehicles
  drop constraint if exists user_vehicles_brake_fluid_notes_source_check;
alter table public.user_vehicles
  add constraint user_vehicles_brake_fluid_notes_source_check
  check (
    brake_fluid_notes_source is null
    or brake_fluid_notes_source in ('user_entered', 'user_manual_confirmed')
  );

comment on column public.user_vehicles.brake_fluid_spec_text is
  'Owner-confirmed brake fluid type/spec (e.g. DOT-4) from manual or hand entry.';
comment on column public.user_vehicles.brake_fluid_notes_text is
  'Optional short check/interval note from the manual after owner confirm.';
comment on column public.user_vehicles.brake_fluid_specs_confirmed_at is
  'When the owner last confirmed manual-extracted brake fluid fields for this vehicle.';

-- ── Candidates: expand kind + fields ────────────────────────────────────────
alter table public.vehicle_manual_extract_candidates
  drop constraint if exists vehicle_manual_extract_candidates_kind_check;
alter table public.vehicle_manual_extract_candidates
  add constraint vehicle_manual_extract_candidates_kind_check
  check (kind in ('oil', 'coolant', 'brake_fluid'));

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
      'coolant_mix',
      'brake_fluid_spec_text',
      'brake_fluid_notes_text'
    )
  );

comment on table public.vehicle_manual_extract_candidates is
  'Heuristic oil/coolant/brake-fluid guesses from a private owner manual. Not truth until the owner confirms.';

comment on column public.vehicle_manual_extract_candidates.kind is
  'oil | coolant | brake_fluid — private staging only.';
