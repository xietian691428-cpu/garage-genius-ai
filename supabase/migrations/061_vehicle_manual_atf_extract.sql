-- ATF / transmission fluid extract staging (kind=atf) + garage ATF fields.
-- Incremental on 060 — does not drop oil_* / coolant_* / brake_fluid_* columns.

-- ── Garage confirmed ATF (owner confirm required) ───────────────────────────
alter table public.user_vehicles
  add column if not exists atf_spec_text text;

alter table public.user_vehicles
  add column if not exists atf_capacity_text text;

alter table public.user_vehicles
  add column if not exists atf_notes_text text;

alter table public.user_vehicles
  add column if not exists atf_spec_source text;

alter table public.user_vehicles
  add column if not exists atf_capacity_source text;

alter table public.user_vehicles
  add column if not exists atf_notes_source text;

alter table public.user_vehicles
  add column if not exists atf_specs_confirmed_at timestamptz;

alter table public.user_vehicles
  drop constraint if exists user_vehicles_atf_spec_source_check;
alter table public.user_vehicles
  add constraint user_vehicles_atf_spec_source_check
  check (
    atf_spec_source is null
    or atf_spec_source in ('user_entered', 'user_manual_confirmed')
  );

alter table public.user_vehicles
  drop constraint if exists user_vehicles_atf_capacity_source_check;
alter table public.user_vehicles
  add constraint user_vehicles_atf_capacity_source_check
  check (
    atf_capacity_source is null
    or atf_capacity_source in ('user_entered', 'user_manual_confirmed')
  );

alter table public.user_vehicles
  drop constraint if exists user_vehicles_atf_notes_source_check;
alter table public.user_vehicles
  add constraint user_vehicles_atf_notes_source_check
  check (
    atf_notes_source is null
    or atf_notes_source in ('user_entered', 'user_manual_confirmed')
  );

comment on column public.user_vehicles.atf_spec_text is
  'Owner-confirmed ATF/CVT/transmission fluid type phrase from manual or hand entry.';
comment on column public.user_vehicles.atf_capacity_text is
  'Owner-confirmed ATF capacity text as written (never written to oil_capacity).';
comment on column public.user_vehicles.atf_notes_text is
  'Optional short ATF check note from the manual after owner confirm.';
comment on column public.user_vehicles.atf_specs_confirmed_at is
  'When the owner last confirmed manual-extracted ATF fields for this vehicle.';

-- ── Candidates: expand kind + fields ────────────────────────────────────────
alter table public.vehicle_manual_extract_candidates
  drop constraint if exists vehicle_manual_extract_candidates_kind_check;
alter table public.vehicle_manual_extract_candidates
  add constraint vehicle_manual_extract_candidates_kind_check
  check (kind in ('oil', 'coolant', 'brake_fluid', 'atf'));

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
      'brake_fluid_notes_text',
      'atf_spec_text',
      'atf_capacity_text',
      'atf_notes_text'
    )
  );

comment on table public.vehicle_manual_extract_candidates is
  'Heuristic oil/coolant/brake-fluid/ATF guesses from a private owner manual. Not truth until the owner confirms.';

comment on column public.vehicle_manual_extract_candidates.kind is
  'oil | coolant | brake_fluid | atf — private staging only. ATF never writes oil_*.';
