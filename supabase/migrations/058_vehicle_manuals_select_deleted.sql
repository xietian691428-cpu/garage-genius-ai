-- Soft-delete was broken: UPDATE … SET deleted_at = now() failed RLS WITH CHECK
-- when a policy (or RETURNING via SELECT) required deleted_at IS NULL.
-- Recreate owner policies so soft-delete + replace upload work.

drop policy if exists vehicle_manuals_select_own on public.vehicle_manuals;
create policy vehicle_manuals_select_own
  on public.vehicle_manuals for select
  using (auth.uid() = user_id);

drop policy if exists vehicle_manuals_insert_own on public.vehicle_manuals;
create policy vehicle_manuals_insert_own
  on public.vehicle_manuals for insert
  with check (auth.uid() = user_id);

drop policy if exists vehicle_manuals_update_own on public.vehicle_manuals;
create policy vehicle_manuals_update_own
  on public.vehicle_manuals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on policy vehicle_manuals_select_own on public.vehicle_manuals is
  'Owners can read their manuals including soft-deleted rows; app filters deleted_at.';
comment on policy vehicle_manuals_update_own on public.vehicle_manuals is
  'Owners can update including soft-delete (deleted_at). WITH CHECK must not require deleted_at is null.';
