-- AI request rate-limit log (anti-abuse for chat / vision / inspect).
-- Monthly token budgets remain in user_token_usage; this caps request spam.

create table if not exists public.ai_request_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  route text not null
    check (route in ('chat', 'vision', 'inspect')),
  tokens_estimated integer,
  tokens_used integer,
  created_at timestamptz not null default now()
);

create index if not exists ai_request_log_user_created_idx
  on public.ai_request_log (user_id, created_at desc);

create index if not exists ai_request_log_created_idx
  on public.ai_request_log (created_at desc);

alter table public.ai_request_log enable row level security;

-- Users can read their own recent usage (optional UI); writes via service role only.
drop policy if exists "Users own ai_request_log select" on public.ai_request_log;
create policy "Users own ai_request_log select"
  on public.ai_request_log for select to authenticated
  using (auth.uid() = user_id);

comment on table public.ai_request_log is
  'Per-request AI audit log for hourly/daily rate limits (lib/ai-abuse.ts).';
