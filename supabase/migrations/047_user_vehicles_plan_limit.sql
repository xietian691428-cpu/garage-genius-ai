-- Enforce garage vehicle caps by subscription (defense in depth vs client bypass).
-- Free 1 · Pro / active trial 5 · Pro Heavy 10. Counts non-archived rows only.

create or replace function public.enforce_user_vehicle_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  status text;
  trial_ends timestamptz;
  max_v int;
  cnt int;
begin
  select p.subscription_status, p.trial_ends_at
    into status, trial_ends
  from public.profiles p
  where p.id = new.user_id;

  if status = 'pro_heavy' then
    max_v := 10;
  elsif status in ('pro', 'active') then
    max_v := 5;
  elsif status = 'trialing' and (trial_ends is null or trial_ends > now()) then
    max_v := 5;
  else
    max_v := 1;
  end if;

  select count(*)::int into cnt
  from public.user_vehicles uv
  where uv.user_id = new.user_id
    and uv.archived_at is null;

  if cnt >= max_v then
    raise exception 'VEHICLE_LIMIT_REACHED: Plan limit: % vehicles. Upgrade for more.', max_v
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists user_vehicles_enforce_limit on public.user_vehicles;
create trigger user_vehicles_enforce_limit
  before insert on public.user_vehicles
  for each row
  execute function public.enforce_user_vehicle_limit();

comment on function public.enforce_user_vehicle_limit() is
  'Rejects user_vehicles INSERT when active garage count is at plan maxVehicles.';
