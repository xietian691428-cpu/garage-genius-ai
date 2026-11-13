-- Production miss feedback queue (desensitized).
-- Internal ops only — never auto-mutate stop-rules / gold-cases / CoachScenarioPlayer.
-- Promote path: admin exports a gold-case draft JSON; human merges + CI.

create table if not exists public.miss_feedback_queue (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'promoted_draft', 'dismissed')),
  -- Failure dimension tags (safety_stop | invented_specs | citation_miss | replace_now | cross_vehicle | user_correction | other)
  dimensions text[] not null default '{}',
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high', 'critical')),
  -- Desensitized snippets only (no full VIN, email, prompt, images)
  intent_snippet text not null default '',
  reply_digest text not null default '',
  -- Structured context (YMM labels, flags) — never raw user_id
  user_hash text,
  vehicle_ymm text,
  route text default 'chat',
  app_version text,
  gold_catalog_version integer,
  -- Optional rewrite / path hints for promote
  diy_path_hint text,
  manual_intent_hint text,
  stop_rule_ids text[] not null default '{}',
  had_garage_fluids boolean not null default false,
  gates_repaired boolean not null default false,
  -- Human / promote
  notes text,
  gold_draft jsonb,
  reviewed_at timestamptz,
  reviewed_by text,
  source text not null default 'chat_auto'
    check (source in ('chat_auto', 'admin_manual', 'user_report'))
);

create index if not exists miss_feedback_queue_status_created_idx
  on public.miss_feedback_queue (status, created_at desc);

create index if not exists miss_feedback_queue_dimensions_gin
  on public.miss_feedback_queue using gin (dimensions);

alter table public.miss_feedback_queue enable row level security;

comment on table public.miss_feedback_queue is
  'Desensitized Chat miss samples for ops review → gold-case draft export. Service role only; no auto rule edits.';
