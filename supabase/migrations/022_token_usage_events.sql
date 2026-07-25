-- Per-LLM-call token ledger for admin monitoring (not the monthly aggregate table).
create table if not exists public.token_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  route text not null
    check (route in ('chat', 'vision', 'inspect', 'other')),
  model text,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  total_tokens integer not null default 0,
  /** Estimated USD cost for this call (provider-side). */
  cost_usd numeric(12, 6) not null default 0,
  /** Optional coach playbook / feature label for "Top playbook" charts. */
  playbook_slug text,
  feature text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists token_usage_events_created_at_idx
  on public.token_usage_events (created_at desc);

create index if not exists token_usage_events_route_created_idx
  on public.token_usage_events (route, created_at desc);

create index if not exists token_usage_events_playbook_idx
  on public.token_usage_events (playbook_slug, created_at desc)
  where playbook_slug is not null;

create index if not exists token_usage_events_user_created_idx
  on public.token_usage_events (user_id, created_at desc);

alter table public.token_usage_events enable row level security;

-- No end-user policies: service role only (admin dashboard). Users never read this ledger.

comment on table public.token_usage_events is
  'Per LLM call token + cost events for /admin/token-usage monitoring.';
