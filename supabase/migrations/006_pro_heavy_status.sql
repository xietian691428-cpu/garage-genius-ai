-- Allow Pro Heavy subscription_status on profiles (PROJECT.md).

alter table public.profiles
  drop constraint if exists profiles_subscription_status_check;

alter table public.profiles
  add constraint profiles_subscription_status_check
  check (subscription_status in (
    'free',
    'trialing',
    'pro',
    'pro_heavy',
    'active',
    'past_due',
    'canceled'
  ));

comment on column public.profiles.subscription_status is
  'Billing state: free | trialing | pro | pro_heavy | past_due | canceled (active legacy → treat as pro)';
