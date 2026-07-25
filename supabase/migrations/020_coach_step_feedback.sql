-- Coach step usefulness feedback (continuous iteration on playbooks).
create table if not exists public.coach_step_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  scenario_slug text not null,
  scenario_id text not null,
  step_id text not null,
  vote text not null check (vote in ('yes', 'no')),
  vehicle_mileage integer,
  vehicle_make text,
  vehicle_model text,
  note text,
  client_session_id text,
  created_at timestamptz not null default now()
);

create index if not exists coach_step_feedback_slug_step_idx
  on public.coach_step_feedback (scenario_slug, step_id, created_at desc);

create index if not exists coach_step_feedback_user_idx
  on public.coach_step_feedback (user_id, created_at desc);

alter table public.coach_step_feedback enable row level security;

drop policy if exists "Users insert own coach feedback" on public.coach_step_feedback;
create policy "Users insert own coach feedback"
  on public.coach_step_feedback for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users read own coach feedback" on public.coach_step_feedback;
create policy "Users read own coach feedback"
  on public.coach_step_feedback for select to authenticated
  using (auth.uid() = user_id);

comment on table public.coach_step_feedback is
  'Per-step “Was this step useful?” votes for coach playbook iteration.';
