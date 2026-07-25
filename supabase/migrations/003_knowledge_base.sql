-- Knowledge base for RAG (Admin CRUD). Embedding may be null until re-indexed.
-- Prefer 004_fix_knowledge_base.sql if the table already exists without is_active.
create extension if not exists vector;

create table if not exists public.knowledge_base (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  content text not null,
  source text not null default 'manual',
  vehicle_make text,
  vehicle_model text,
  vehicle_years text,
  category text not null default 'general',
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- If table already existed, ensure Admin columns are present
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
alter table public.knowledge_base
  add column if not exists is_active boolean not null default true;
alter table public.knowledge_base
  add column if not exists created_at timestamptz not null default now();
alter table public.knowledge_base
  add column if not exists updated_at timestamptz not null default now();

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
