-- Distinguish CVT vs conventional ATF on the existing kind=atf path.
-- No new kind=cvt. Does not alter oil_* / coolant_* / brake_fluid_* columns.

-- ── Garage ──────────────────────────────────────────────────────────────────
alter table public.user_vehicles
  add column if not exists transmission_kind text;

alter table public.user_vehicles
  drop constraint if exists user_vehicles_transmission_kind_check;
alter table public.user_vehicles
  add constraint user_vehicles_transmission_kind_check
  check (
    transmission_kind is null
    or transmission_kind in ('atf', 'cvt', 'unknown')
  );

comment on column public.user_vehicles.transmission_kind is
  'Owner-confirmed transmission fluid class: atf | cvt | unknown. Spec text stays verbatim in atf_spec_text.';

-- ── Staging candidates (kind=atf rows only use this) ────────────────────────
alter table public.vehicle_manual_extract_candidates
  add column if not exists transmission_kind text;

alter table public.vehicle_manual_extract_candidates
  drop constraint if exists vehicle_manual_extract_candidates_transmission_kind_check;
alter table public.vehicle_manual_extract_candidates
  add constraint vehicle_manual_extract_candidates_transmission_kind_check
  check (
    transmission_kind is null
    or transmission_kind in ('atf', 'cvt', 'unknown')
  );

comment on column public.vehicle_manual_extract_candidates.transmission_kind is
  'Heuristic atf|cvt|unknown for kind=atf staging. Never writes oil_*.';
