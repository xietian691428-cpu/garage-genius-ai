-- NHTSA vPIC snapshot on garage vehicles (compact JSON, VIN lives in vin column).
-- Safe to apply more than once.

alter table public.user_vehicles
  add column if not exists vpic_decode jsonb,
  add column if not exists vpic_decoded_at timestamptz;

comment on column public.user_vehicles.vpic_decode is
  'NHTSA vPIC DecodeVinValues compact snapshot (server). Do not log this blob with a full VIN.';

comment on column public.user_vehicles.vpic_decoded_at is
  'When vpic_decode was last written from NHTSA vPIC.';
