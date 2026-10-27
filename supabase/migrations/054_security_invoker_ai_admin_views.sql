-- Harden AI cost / admin margin views flagged by Supabase Advisor
-- ("Security Definer View" CRITICAL).
--
-- Default Postgres views run as the owner (SECURITY DEFINER-like), which can
-- bypass RLS on underlying tables if anon/authenticated have SELECT on the view.
-- These views are service-role / admin only — force invoker + lock down grants.

create or replace view public.ai_usage_events
with (security_invoker = true) as
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
  'Spec alias of token_usage_events (security_invoker). Service role only.';

create or replace view public.admin_ai_cost_vs_revenue_month
with (security_invoker = true) as
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
  'UTC month per-user AI cost vs Stripe revenue (security_invoker). Service role / admin SQL.';

create or replace view public.admin_ai_cost_vs_revenue_by_plan
with (security_invoker = true) as
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
  'UTC month rollup by plan (security_invoker). Service role / admin SQL.';

revoke all on table public.ai_usage_events from public, anon, authenticated;
revoke all on table public.admin_ai_cost_vs_revenue_month from public, anon, authenticated;
revoke all on table public.admin_ai_cost_vs_revenue_by_plan from public, anon, authenticated;

grant select on table public.ai_usage_events to service_role;
grant select on table public.admin_ai_cost_vs_revenue_month to service_role;
grant select on table public.admin_ai_cost_vs_revenue_by_plan to service_role;
