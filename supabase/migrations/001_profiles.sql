-- Garage Genius AI: user profiles + subscription fields
-- Run in Supabase SQL Editor (or via CLI migration).

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  subscription_status text not null default 'free'
    check (subscription_status in (
      'free',
      'trialing',
      'pro',
      'active',
      'past_due',
      'canceled'
    )),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_stripe_customer_id_idx
  on public.profiles (stripe_customer_id);

create index if not exists profiles_subscription_status_idx
  on public.profiles (subscription_status);

create or replace function public.set_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row
  execute function public.set_profiles_updated_at();

-- Auto-create profile on signup (+ optional 14-day Pro trial for Launch)
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

alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "Users can update own profile (non-billing)" on public.profiles;
create policy "Users can update own profile (non-billing)"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Prevent authenticated clients from mutating billing fields (webhooks use service role).
create or replace function public.protect_profile_billing_fields()
returns trigger
language plpgsql
as $$
begin
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

drop trigger if exists profiles_protect_billing on public.profiles;
create trigger profiles_protect_billing
  before update on public.profiles
  for each row
  execute function public.protect_profile_billing_fields();

comment on table public.profiles is
  'User profile + Stripe subscription state for Free/Pro gating (PROJECT.md Launch).';
