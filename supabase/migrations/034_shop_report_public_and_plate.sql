-- Shop report public share tokens (30-day) + vehicle license plate

alter table public.shop_reports
  add column if not exists public_token text,
  add column if not exists expires_at timestamptz;

create unique index if not exists shop_reports_public_token_uidx
  on public.shop_reports (public_token)
  where public_token is not null;

create index if not exists shop_reports_expires_at_idx
  on public.shop_reports (expires_at)
  where expires_at is not null;

comment on column public.shop_reports.public_token is
  'Unguessable token for /r/[token] read-only web handoff (30-day).';
comment on column public.shop_reports.expires_at is
  'When the public share link stops working.';

alter table public.user_vehicles
  add column if not exists license_plate text;

comment on column public.user_vehicles.license_plate is
  'Optional license / number plate for shop handoff reports.';
