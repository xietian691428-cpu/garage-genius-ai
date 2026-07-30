-- Optional insurance context on garage vehicles (education / tips only).
-- Never used to auto-adjudicate coverage or claim outcomes.

alter table public.user_vehicles
  add column if not exists country_region text null;

alter table public.user_vehicles
  add column if not exists country_state text null;

alter table public.user_vehicles
  add column if not exists insurance_provider text null;

comment on column public.user_vehicles.country_region is
  'Optional insurance jurisdiction country/region (e.g. United States). Education tips only — not claim adjudication.';

comment on column public.user_vehicles.country_state is
  'Optional US state / province for insurance tips. Free text. Education only.';

comment on column public.user_vehicles.insurance_provider is
  'Optional insurer name for soft tip personalization. Not linked to a real policy.';
