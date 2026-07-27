-- Data flywheel: review queue → golden QA → knowledge promote + RAG recall log.
-- Closes the loop from production feedback back into RAG (and optional fine-tune export).

create table if not exists public.flywheel_review_queue (
  id uuid primary key default gen_random_uuid(),
  source_type text not null
    check (source_type in ('coach_step_feedback', 'chat_manual', 'ops_import')),
  source_id uuid,
  user_id uuid references auth.users (id) on delete set null,
  scenario_slug text,
  scenario_id text,
  step_id text,
  vote text check (vote is null or vote in ('yes', 'no')),
  vehicle_make text,
  vehicle_model text,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'promoted')),
  -- Reviewer fills these before promote
  draft_title text,
  draft_question text,
  draft_answer text,
  draft_category text default 'repair',
  golden_qa_id uuid,
  knowledge_base_id uuid,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by text
);

create unique index if not exists flywheel_review_queue_source_uidx
  on public.flywheel_review_queue (source_type, source_id)
  where source_id is not null;

create index if not exists flywheel_review_queue_status_idx
  on public.flywheel_review_queue (status, created_at desc);

comment on table public.flywheel_review_queue is
  'Admin review queue: coach “no” votes (and manual) → correct Q&A → golden + knowledge.';

create table if not exists public.golden_qa (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  title text,
  category text not null default 'repair',
  vehicle_make text,
  vehicle_model text,
  source_type text,
  source_id uuid,
  review_queue_id uuid references public.flywheel_review_queue (id) on delete set null,
  knowledge_base_id uuid,
  quality_score smallint default 5
    check (quality_score is null or (quality_score >= 1 and quality_score <= 5)),
  used_in_finetune_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists golden_qa_created_idx
  on public.golden_qa (created_at desc);

create index if not exists golden_qa_finetune_idx
  on public.golden_qa (used_in_finetune_at)
  where used_in_finetune_at is null;

comment on table public.golden_qa is
  'Human/AI-approved Q&A pairs for RAG promote and monthly DeepSeek fine-tune export.';

-- Lightweight RAG recall log (hit ids/titles only — not full prompts/completions)
create table if not exists public.rag_retrieval_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  route text not null default 'chat',
  query_preview text,
  hit_ids uuid[] not null default '{}',
  hit_titles text[] not null default '{}',
  hit_count integer not null default 0,
  vehicle_make text,
  vehicle_model text,
  created_at timestamptz not null default now()
);

create index if not exists rag_retrieval_events_created_idx
  on public.rag_retrieval_events (created_at desc);

create index if not exists rag_retrieval_events_user_idx
  on public.rag_retrieval_events (user_id, created_at desc);

comment on table public.rag_retrieval_events is
  'Per-chat RAG hit snapshot for flywheel / quality ops (ids + titles, not full content).';

alter table public.flywheel_review_queue enable row level security;
alter table public.golden_qa enable row level security;
alter table public.rag_retrieval_events enable row level security;

-- FK from queue → golden after both exist
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'flywheel_review_queue_golden_fk'
  ) then
    alter table public.flywheel_review_queue
      add constraint flywheel_review_queue_golden_fk
      foreign key (golden_qa_id) references public.golden_qa (id) on delete set null;
  end if;
end $$;
