-- Trial lifecycle: 14-day Pro Trial on signup + self-service expiry sync.

-- Allow security-definer RPCs to update billing fields via session flag
create or replace function public.protect_profile_billing_fields()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.bypass_billing_protect', true) = 'on' then
    return new;
  end if;

  if auth.role() = 'authenticated' then
    new.subscription_status := old.subscription_status;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.trial_ends_at := old.trial_ends_at;
    new.current_period_end := old.current_period_end;
  end if;
  return new;
end;
$$;

-- Signup: grant 14-day Pro Trial
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, subscription_status, trial_ends_at)
  values (
    new.id,
    new.email,
    'trialing',
    now() + interval '14 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- Ensure profile exists with trial (OAuth / missed trigger)
create or replace function public.ensure_my_profile_trial()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  select * into p from public.profiles where id = uid;
  if found then
    return p;
  end if;

  perform set_config('app.bypass_billing_protect', 'on', true);

  insert into public.profiles (id, email, subscription_status, trial_ends_at)
  values (
    uid,
    coalesce(auth.jwt() ->> 'email', null),
    'trialing',
    now() + interval '14 days'
  )
  returning * into p;

  return p;
end;
$$;

grant execute on function public.ensure_my_profile_trial() to authenticated;

-- Expire stale trials → free when trial_ends_at passed and no Stripe sub
create or replace function public.sync_my_trial_status()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p public.profiles;
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;

  perform public.ensure_my_profile_trial();
  select * into p from public.profiles where id = uid;

  if p.subscription_status = 'trialing'
     and p.trial_ends_at is not null
     and p.trial_ends_at <= now()
     and p.stripe_subscription_id is null then
    perform set_config('app.bypass_billing_protect', 'on', true);
    update public.profiles
    set subscription_status = 'free'
    where id = uid
    returning * into p;
  end if;

  return p;
end;
$$;

grant execute on function public.sync_my_trial_status() to authenticated;

comment on function public.ensure_my_profile_trial() is
  'Creates profiles row with 14-day Pro Trial if missing.';
comment on function public.sync_my_trial_status() is
  'Expires trialing → free when trial_ends_at has passed (no Stripe sub).';
