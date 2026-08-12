-- Fix singular copy when Free maxVehicles = 1 (was always "vehicles").

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
    if max_v = 1 then
      raise exception 'VEHICLE_LIMIT_REACHED: Plan limit: 1 vehicle. Upgrade for more.'
        using errcode = 'P0001';
    else
      raise exception 'VEHICLE_LIMIT_REACHED: Plan limit: % vehicles. Upgrade for more.', max_v
        using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;
