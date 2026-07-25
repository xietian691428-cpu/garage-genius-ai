-- Soft-archive for vehicle profiles (garage “档案”).
-- Active garage = archived_at IS NULL.

alter table public.user_vehicles
  add column if not exists archived_at timestamptz;

create index if not exists user_vehicles_user_active_idx
  on public.user_vehicles (user_id, updated_at desc)
  where archived_at is null;

comment on column public.user_vehicles.archived_at is
  'When set, vehicle is archived (hidden from active garage) but retained for history.';
