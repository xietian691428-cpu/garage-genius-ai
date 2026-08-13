-- Keep the primary smoke-test account on Pro Trial.
-- App-layer resolveSubscription also skips expiry for this email.

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
     and p.stripe_subscription_id is null
     and lower(coalesce(p.email, '')) <> '18565006079@163.com' then
    perform set_config('app.bypass_billing_protect', 'on', true);
    update public.profiles
    set subscription_status = 'free'
    where id = uid
    returning * into p;
  end if;

  return p;
end;
$$;

comment on function public.sync_my_trial_status() is
  'Expires trialing → free when trial_ends_at has passed (no Stripe sub). Skips the primary QA test email.';
