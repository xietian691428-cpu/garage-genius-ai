-- Affiliate parts catalog for Admin CRUD + AI purchase recommendations
create table if not exists public.affiliate_parts (
  id uuid primary key default gen_random_uuid(),
  oem_number text not null,
  name text not null,
  brand text not null default '',
  category text not null default 'other'
    check (category in (
      'brake',
      'engine',
      'filter',
      'suspension',
      'electrical',
      'consumable',
      'other'
    )),
  vehicle_make text,
  vehicle_model text,
  vehicle_years text,
  price_min numeric(10, 2),
  price_max numeric(10, 2),
  amazon_url text,
  rockauto_url text,
  autozone_url text,
  oreilly_url text,
  other_urls text[] not null default '{}',
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists affiliate_parts_oem_vehicle_uidx
  on public.affiliate_parts (
    oem_number,
    coalesce(vehicle_make, ''),
    coalesce(vehicle_model, ''),
    coalesce(vehicle_years, '')
  );

create index if not exists affiliate_parts_oem_number_idx
  on public.affiliate_parts (oem_number);

create index if not exists affiliate_parts_active_idx
  on public.affiliate_parts (is_active);

create or replace function public.set_affiliate_parts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists affiliate_parts_set_updated_at on public.affiliate_parts;
create trigger affiliate_parts_set_updated_at
  before update on public.affiliate_parts
  for each row
  execute function public.set_affiliate_parts_updated_at();

alter table public.affiliate_parts enable row level security;

-- Public read of active affiliate parts (for future chat enrichment)
drop policy if exists "Anyone can read active affiliate parts" on public.affiliate_parts;
create policy "Anyone can read active affiliate parts"
  on public.affiliate_parts
  for select
  to anon, authenticated
  using (is_active = true);

-- Writes go through service role (Admin Server Actions)
comment on table public.affiliate_parts is
  'Admin-managed OEM + affiliate purchase links (PROJECT.md Admin).';
