-- Garage Genius AI: Token usage + top-up purchases (PROJECT.md 收费与 Token 策略)
-- Run in Supabase SQL Editor.

-- One usage row per user (monthly quota tracking)
create table if not exists public.user_token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  -- Lifetime / period counters
  total_tokens_used bigint not null default 0,
  -- Tokens consumed in the current billing month (resets with monthly_reset_date)
  monthly_tokens_used bigint not null default 0,
  -- Purchased top-up tokens remaining (after included plan quota is exhausted)
  bonus_tokens_remaining bigint not null default 0,
  monthly_reset_date timestamptz not null default now(),
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Top-up purchase ledger
create table if not exists public.token_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  amount_usd numeric(10, 2) not null,
  tokens_added bigint not null,
  stripe_payment_intent_id text,
  created_at timestamptz not null default now()
);

create index if not exists idx_user_token_usage_user_id
  on public.user_token_usage (user_id);

create index if not exists idx_token_purchases_user_id
  on public.token_purchases (user_id);

create index if not exists idx_token_purchases_created_at
  on public.token_purchases (created_at desc);

create or replace function public.set_user_token_usage_last_updated()
returns trigger
language plpgsql
as $$
begin
  new.last_updated = now();
  return new;
end;
$$;

drop trigger if exists user_token_usage_set_last_updated on public.user_token_usage;
create trigger user_token_usage_set_last_updated
  before update on public.user_token_usage
  for each row
  execute function public.set_user_token_usage_last_updated();

-- Auto-create usage row when a profile is created (or backfill via trigger on auth.users)
create or replace function public.handle_new_user_token_usage()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_token_usage (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_token_usage on auth.users;
create trigger on_auth_user_created_token_usage
  after insert on auth.users
  for each row
  execute function public.handle_new_user_token_usage();

alter table public.user_token_usage enable row level security;
alter table public.token_purchases enable row level security;

drop policy if exists "Users can read own token usage" on public.user_token_usage;
create policy "Users can read own token usage"
  on public.user_token_usage
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own token purchases" on public.token_purchases;
create policy "Users can read own token purchases"
  on public.token_purchases
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Writes (increment / top-up) go through service role (API / webhooks only)
comment on table public.user_token_usage is
  'Per-user token counters for Free/Pro/Heavy quotas (PROJECT.md).';
comment on table public.token_purchases is
  'Token top-up ledger ($0.07–$0.08 per 1k tokens).';
