-- Market / country version for garage vehicles.
-- Owner manuals, lighting, emissions, and some powertrains differ by sales region.

alter table public.user_vehicles
  add column if not exists market text not null default 'US';

alter table public.user_vehicles
  drop constraint if exists user_vehicles_market_check;

alter table public.user_vehicles
  add constraint user_vehicles_market_check
  check (market in ('US', 'CA', 'MX', 'GB', 'EU', 'AU', 'OTHER'));

create index if not exists user_vehicles_market_idx
  on public.user_vehicles (market);

comment on column public.user_vehicles.market is
  'Sales-market / owner-manual version: US, CA, MX, GB, EU, AU, OTHER.';
