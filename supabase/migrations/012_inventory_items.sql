-- User parts inventory (wishlist / stock) for AI + affiliate recommendations.

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  vehicle_id text not null,
  oem_number text,
  brand text not null default '',
  name text not null,
  category text not null default 'other'
    check (category in ('brake','engine','filter','suspension','electrical','consumable','other')),
  current_stock integer not null default 0,
  min_stock integer not null default 1,
  price numeric(10,2) not null default 0,
  location text not null default 'Wishlist',
  purchase_links text[] not null default '{}'::text[],
  notes text,
  last_updated timestamptz not null default now(),
  last_used_in_repair text,
  user_id uuid references auth.users (id) on delete cascade,
  constraint inventory_items_stock_check check (current_stock >= 0),
  constraint inventory_items_min_stock_check check (min_stock >= 0)
);

-- Upsert key used by inventoryService.batchUpsert
-- Matches inventoryService.batchUpsert onConflict: oem_number,vehicle_id
create unique index if not exists inventory_items_oem_vehicle_uidx
  on public.inventory_items (oem_number, vehicle_id);

create index if not exists inventory_items_vehicle_id_idx
  on public.inventory_items (vehicle_id);

create index if not exists inventory_items_user_id_idx
  on public.inventory_items (user_id);

alter table public.inventory_items enable row level security;

drop policy if exists "Users can read own inventory" on public.inventory_items;
create policy "Users can read own inventory"
  on public.inventory_items for select to authenticated
  using (user_id is null or auth.uid() = user_id);

drop policy if exists "Users can insert own inventory" on public.inventory_items;
create policy "Users can insert own inventory"
  on public.inventory_items for insert to authenticated
  with check (user_id is null or auth.uid() = user_id);

drop policy if exists "Users can update own inventory" on public.inventory_items;
create policy "Users can update own inventory"
  on public.inventory_items for update to authenticated
  using (user_id is null or auth.uid() = user_id)
  with check (user_id is null or auth.uid() = user_id);

drop policy if exists "Users can delete own inventory" on public.inventory_items;
create policy "Users can delete own inventory"
  on public.inventory_items for delete to authenticated
  using (user_id is null or auth.uid() = user_id);

comment on table public.inventory_items is
  'Per-vehicle parts wishlist/stock from Chat / Focus affiliate + AI recommendations.';
