-- DIY skill level (段位) — prompt/RAG tone adaptation, not billing.
-- Config for prompt prefixes lives in code (lib/diy-skill.ts); optional DB override table for ops.

alter table public.profiles
  add column if not exists diy_skill text not null default 'beginner'
    check (diy_skill in ('beginner', 'enthusiast', 'professional'));

alter table public.profiles
  add column if not exists diy_skill_confidence smallint not null default 40
    check (diy_skill_confidence >= 0 and diy_skill_confidence <= 100);

alter table public.profiles
  add column if not exists diy_skill_source text not null default 'default'
    check (diy_skill_source in ('default', 'self', 'inferred', 'manual'));

alter table public.profiles
  add column if not exists diy_skill_updated_at timestamptz;

comment on column public.profiles.diy_skill is
  'DIY mechanic skill band for coach tone / RAG soft ranking.';
comment on column public.profiles.diy_skill_confidence is
  '0–100 confidence in current diy_skill (self-report starts ~70).';
comment on column public.profiles.diy_skill_source is
  'How diy_skill was set: default | self (onboarding/settings) | inferred (cron) | manual (admin).';

-- Optional ops overrides (usually unused — app defaults to lib/diy-skill.ts)
create table if not exists public.skill_assessment_config (
  skill_level text primary key
    check (skill_level in ('beginner', 'enthusiast', 'professional')),
  system_prompt_prefix text not null,
  detail_coefficient numeric(4, 2) not null default 1.0
    check (detail_coefficient > 0 and detail_coefficient <= 3),
  rag_prefer_categories text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.skill_assessment_config enable row level security;

insert into public.skill_assessment_config (
  skill_level, system_prompt_prefix, detail_coefficient, rag_prefer_categories
) values
  (
    'beginner',
    'User is a DIY beginner. Prefer plain language, safety first, define jargon once, suggest shop when risk is high.',
    1.2,
    array['safety', 'basics', 'general', 'brake', 'filter']
  ),
  (
    'enthusiast',
    'User is a DIY enthusiast. Balanced depth: clear steps, name tools, include torque when known.',
    1.0,
    array['repair', 'diagnostics', 'maintenance', 'general']
  ),
  (
    'professional',
    'User is an advanced DIYer / tech-adjacent. Dense, precise answers; assume tools/torque literacy; skip baby-steps.',
    0.85,
    array['repair', 'diagnostics', 'manual', 'torque', 'tsb']
  )
on conflict (skill_level) do nothing;

-- Allow skill-change in_app notices without colliding with daily maintenance reminders
drop index if exists reminder_deliveries_daily_unique;
create unique index if not exists reminder_deliveries_daily_unique
  on public.reminder_deliveries (
    vehicle_id,
    channel,
    coalesce(reason, ''),
    (timezone('UTC', sent_at)::date)
  );
