-- Tighten inventory_items RLS: users may only access their own rows.
-- Also backfill any orphan rows that somehow have null user_id (best-effort: leave them;
-- they become inaccessible after this policy change — safe default).

drop policy if exists "Users can read own inventory" on public.inventory_items;
create policy "Users can read own inventory"
  on public.inventory_items for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own inventory" on public.inventory_items;
create policy "Users can insert own inventory"
  on public.inventory_items for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own inventory" on public.inventory_items;
create policy "Users can update own inventory"
  on public.inventory_items for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own inventory" on public.inventory_items;
create policy "Users can delete own inventory"
  on public.inventory_items for delete to authenticated
  using (auth.uid() = user_id);

comment on table public.inventory_items is
  'Per-vehicle parts wishlist/stock. RLS: auth.uid() = user_id only (no null user_id access).';
