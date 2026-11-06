-- Google Play Billing entitlement fields. Does not drop Stripe / Apple columns.
-- Clients cannot self-grant these (protect_profile_billing_fields).

do $$
declare
  r record;
begin
  for r in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'profiles'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%billing_provider%'
  loop
    execute format('alter table public.profiles drop constraint %I', r.conname);
  end loop;
end $$;

alter table public.profiles
  add constraint profiles_billing_provider_check
  check (
    billing_provider is null
    or billing_provider in ('stripe', 'apple', 'google_play')
  );

alter table public.profiles
  add column if not exists google_purchase_token text;

alter table public.profiles
  add column if not exists google_product_id text;

alter table public.profiles
  add column if not exists google_order_id text;

create unique index if not exists profiles_google_purchase_token_uidx
  on public.profiles (google_purchase_token)
  where google_purchase_token is not null;

comment on column public.profiles.billing_provider is
  'Winning paid channel after merge: stripe, apple, or google_play.';
comment on column public.profiles.google_purchase_token is
  'Play purchase token for the entitlement currently winning on this profile.';

create table if not exists public.google_play_purchases (
  purchase_token text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id text not null,
  order_id text,
  package_name text not null,
  expires_at timestamptz,
  subscription_state text,
  plan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists google_play_purchases_user_idx
  on public.google_play_purchases (user_id);

alter table public.google_play_purchases enable row level security;

comment on table public.google_play_purchases is
  'Server-verified Play subscriptions. purchase_token is unique so one purchase cannot bind two accounts. Service role only.';

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
    new.billing_provider := old.billing_provider;
    new.apple_original_transaction_id := old.apple_original_transaction_id;
    new.apple_product_id := old.apple_product_id;
    new.apple_environment := old.apple_environment;
    new.google_purchase_token := old.google_purchase_token;
    new.google_product_id := old.google_product_id;
    new.google_order_id := old.google_order_id;
  end if;
  return new;
end;
$$;
