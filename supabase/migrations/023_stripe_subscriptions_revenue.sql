-- Stripe subscription mirror (source of truth for admin MRR) + soft sync from webhooks.
-- Entitlements for the app still primarily use profiles.subscription_status.

create table if not exists public.stripe_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_customer_id text not null,
  stripe_price_id text,
  status text not null
    check (status in (
      'trialing', 'active', 'past_due', 'canceled', 'unpaid',
      'incomplete', 'incomplete_expired', 'paused'
    )),
  plan text not null default 'pro'
    check (plan in ('pro', 'pro_heavy')),
  billing_interval text
    check (billing_interval is null or billing_interval in ('month', 'year')),
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  raw_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists stripe_subscriptions_user_id_idx
  on public.stripe_subscriptions (user_id);

create index if not exists stripe_subscriptions_status_idx
  on public.stripe_subscriptions (status);

create index if not exists stripe_subscriptions_customer_idx
  on public.stripe_subscriptions (stripe_customer_id);

-- Invoice / payment revenue ledger for admin dashboard
create table if not exists public.stripe_revenue_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  stripe_event_id text unique,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  kind text not null
    check (kind in ('subscription', 'recharge', 'other')),
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  plan text,
  created_at timestamptz not null default now()
);

create index if not exists stripe_revenue_events_created_idx
  on public.stripe_revenue_events (created_at desc);

create index if not exists stripe_revenue_events_kind_idx
  on public.stripe_revenue_events (kind, created_at desc);

-- Free-tier coach playbook start counters (monthly)
create table if not exists public.coach_playbook_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  period_ym text not null,
  run_count integer not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, period_ym)
);

create index if not exists coach_playbook_usage_user_period_idx
  on public.coach_playbook_usage (user_id, period_ym);

alter table public.stripe_subscriptions enable row level security;
alter table public.stripe_revenue_events enable row level security;
alter table public.coach_playbook_usage enable row level security;

-- Users can read own playbook usage (for UI meters)
drop policy if exists "Users read own playbook usage" on public.coach_playbook_usage;
create policy "Users read own playbook usage"
  on public.coach_playbook_usage for select to authenticated
  using (auth.uid() = user_id);

-- stripe_subscriptions / revenue_events: service role only (no user policies)

comment on table public.stripe_subscriptions is
  'Mirrored Stripe subscriptions for MRR/ARPU admin stats; profiles remain entitlement source.';
comment on table public.stripe_revenue_events is
  'Paid invoice / recharge events for revenue dashboard.';
comment on table public.coach_playbook_usage is
  'Free coach playbook starts; period_ym stores r30-{signupDay}-{index} (30-day windows from registration).';
