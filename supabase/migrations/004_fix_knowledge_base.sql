-- Fix existing knowledge_base table (created before Admin schema).
-- Safe to re-run: only adds missing columns / objects.

create extension if not exists vector;

alter table public.knowledge_base
  add column if not exists source text not null default 'manual';

alter table public.knowledge_base
  add column if not exists vehicle_make text;

alter table public.knowledge_base
  add column if not exists vehicle_model text;

alter table public.knowledge_base
  add column if not exists vehicle_years text;

alter table public.knowledge_base
  add column if not exists category text not null default 'general';

alter table public.knowledge_base
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- embedding may already exist with a different dimension; skip if present
do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'knowledge_base'
      and column_name = 'embedding'
  ) then
    alter table public.knowledge_base
      add column embedding vector(1536);
  end if;
end $$;

alter table public.knowledge_base
  add column if not exists is_active boolean not null default true;

alter table public.knowledge_base
  add column if not exists created_at timestamptz not null default now();

alter table public.knowledge_base
  add column if not exists updated_at timestamptz not null default now();

create index if not exists knowledge_base_vehicle_idx
  on public.knowledge_base (vehicle_make, vehicle_model);

create index if not exists knowledge_base_active_idx
  on public.knowledge_base (is_active);

create or replace function public.set_knowledge_base_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists knowledge_base_set_updated_at on public.knowledge_base;
create trigger knowledge_base_set_updated_at
  before update on public.knowledge_base
  for each row
  execute function public.set_knowledge_base_updated_at();

alter table public.knowledge_base enable row level security;

drop policy if exists "Anyone can read active knowledge" on public.knowledge_base;
create policy "Anyone can read active knowledge"
  on public.knowledge_base
  for select
  to anon, authenticated
  using (is_active = true);

comment on table public.knowledge_base is
  'RAG knowledge entries managed via Admin (PROJECT.md).';
