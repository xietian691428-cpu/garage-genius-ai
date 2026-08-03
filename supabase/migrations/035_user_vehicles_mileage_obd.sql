-- OBD mileage write-back metadata on user_vehicles.
-- PID 0xA6 returns km; we store mileage in the vehicle's preferred unit.

alter table public.user_vehicles
  add column if not exists mileage_unit text not null default 'miles'
    check (mileage_unit in ('miles', 'km'));

alter table public.user_vehicles
  add column if not exists mileage_updated_at timestamptz;

alter table public.user_vehicles
  add column if not exists mileage_source text
    check (
      mileage_source is null
      or mileage_source in ('manual', 'obd', 'import')
    );

-- Infer unit from sales market for existing rows (US/CA/GB → miles; EU/AU/MX → km).
update public.user_vehicles
set mileage_unit = 'km'
where coalesce(market, 'US') in ('EU', 'AU', 'MX')
  and mileage_unit = 'miles';

comment on column public.user_vehicles.mileage_unit is
  'Unit for mileage column: miles or km. OBD A6 is km and converted on write-back.';

comment on column public.user_vehicles.mileage_updated_at is
  'When mileage was last set (manual edit or OBD sync).';

comment on column public.user_vehicles.mileage_source is
  'Origin of the latest mileage value: manual | obd | import.';
