-- AI cost loop: prices, plan limits, usage view, cost vs revenue.
-- Extends token_usage_events (existing ledger) rather than a second write path.

alter table public.token_usage_events
  add column if not exists provider text;

alter table public.token_usage_events
  drop constraint if exists token_usage_events_provider_check;

alter table public.token_usage_events
  add constraint token_usage_events_provider_check
  check (provider is null or provider in ('deepseek', 'kimi', 'other'));

create index if not exists token_usage_events_provider_created_idx
  on public.token_usage_events (provider, created_at desc);

create index if not exists token_usage_events_user_provider_created_idx
  on public.token_usage_events (user_id, provider, created_at desc);

comment on column public.token_usage_events.provider is
  'LLM vendor for cost: deepseek (text) or kimi (vision).';

-- User-facing name from the product spec (maps the existing ledger).
create or replace view public.ai_usage_events as
select
  id,
  user_id,
  coalesce(provider, 'deepseek') as provider,
  model,
  coalesce(feature, route) as feature,
  prompt_tokens as input_tokens,
  completion_tokens as output_tokens,
  cost_usd,
  created_at
from public.token_usage_events;

comment on view public.ai_usage_events is
  'Spec alias of token_usage_events: input/output tokens + stamped cost_usd.';

create table if not exists public.ai_model_prices (
  provider text not null,
  model text not null,
  input_per_1m numeric(12, 6) not null,
  output_per_1m numeric(12, 6) not null,
  per_call_floor_usd numeric(12, 6) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (provider, model)
);

alter table public.ai_model_prices enable row level security;

comment on table public.ai_model_prices is
  'List prices used to stamp cost_usd. App also ships in-code defaults (lib/ai-cost/prices.ts).';

insert into public.ai_model_prices (provider, model, input_per_1m, output_per_1m, per_call_floor_usd)
values
  ('deepseek', 'deepseek-chat', 0.14, 0.28, 0),
  ('deepseek', 'deepseek-vision', 0.14, 0.28, 0),
  ('kimi', 'kimi-k3', 2.5, 10, 0.012)
on conflict (provider, model) do update set
  input_per_1m = excluded.input_per_1m,
  output_per_1m = excluded.output_per_1m,
  per_call_floor_usd = excluded.per_call_floor_usd,
  updated_at = now();

create table if not exists public.ai_plan_limits (
  plan text primary key
    check (plan in ('free', 'pro', 'pro_heavy')),
  ai_budget_usd numeric(12, 4) not null,
  vision_calls_per_period integer not null,
  text_soft_cap integer not null,
  updated_at timestamptz not null default now()
);

alter table public.ai_plan_limits enable row level security;

comment on table public.ai_plan_limits is
  'UTC-month AI USD budget + vision call caps. Trial uses pro. Canonical copy lives in lib/ai-cost/plan-limits.ts.';

insert into public.ai_plan_limits (plan, ai_budget_usd, vision_calls_per_period, text_soft_cap)
values
  ('free', 0.25, 3, 15000),
  ('pro', 3.00, 30, 150000),
  ('pro_heavy', 6.50, 80, 400000)
on conflict (plan) do update set
  ai_budget_usd = excluded.ai_budget_usd,
  vision_calls_per_period = excluded.vision_calls_per_period,
  text_soft_cap = excluded.text_soft_cap,
  updated_at = now();

-- This UTC month: per-user AI cost vs Stripe cash received.
create or replace view public.admin_ai_cost_vs_revenue_month as
with bounds as (
  select
    date_trunc('month', timezone('utc', now())) as start_at,
    date_trunc('month', timezone('utc', now())) + interval '1 month' as end_at
),
cost as (
  select
    e.user_id,
    coalesce(sum(e.cost_usd), 0) as ai_cost_usd,
    count(*) filter (
      where coalesce(e.provider, '') = 'kimi' or e.route = 'vision'
    ) as vision_calls
  from public.token_usage_events e
  cross join bounds b
  where e.created_at >= b.start_at
    and e.created_at < b.end_at
    and e.user_id is not null
  group by e.user_id
),
rev as (
  select
    r.user_id,
    coalesce(sum(r.amount_cents), 0)::numeric / 100 as revenue_usd
  from public.stripe_revenue_events r
  cross join bounds b
  where r.created_at >= b.start_at
    and r.created_at < b.end_at
    and r.user_id is not null
  group by r.user_id
)
select
  coalesce(c.user_id, r.user_id) as user_id,
  coalesce(pr.subscription_status, 'free') as plan,
  coalesce(c.ai_cost_usd, 0) as ai_cost_usd,
  coalesce(r.revenue_usd, 0) as revenue_usd,
  coalesce(r.revenue_usd, 0) - coalesce(c.ai_cost_usd, 0) as margin_usd,
  coalesce(c.vision_calls, 0) as vision_calls
from cost c
full outer join rev r on r.user_id = c.user_id
left join public.profiles pr on pr.id = coalesce(c.user_id, r.user_id);

comment on view public.admin_ai_cost_vs_revenue_month is
  'UTC calendar month: per-user AI cost_usd vs Stripe revenue. Service role / admin SQL.';

create or replace view public.admin_ai_cost_vs_revenue_by_plan as
select
  plan,
  count(*)::integer as users,
  sum(ai_cost_usd) as ai_cost_usd,
  sum(revenue_usd) as revenue_usd,
  sum(margin_usd) as margin_usd,
  sum(vision_calls)::integer as vision_calls
from public.admin_ai_cost_vs_revenue_month
group by plan;

comment on view public.admin_ai_cost_vs_revenue_by_plan is
  'UTC calendar month rollup of admin_ai_cost_vs_revenue_month by profiles.subscription_status.';
