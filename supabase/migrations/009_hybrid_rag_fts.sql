-- Hybrid RAG foundation: Postgres full-text search (tsvector) + optional pgvector,
-- fused with Reciprocal Rank Fusion (RRF).
--
-- Phase A: FTS works with zero embedding API.
-- Phase B: fill embedding when a provider is available.
-- Phase C: match_knowledge_hybrid merges both ranked lists.

create extension if not exists vector;

-- ── tsvector column ─────────────────────────────────────────────
alter table public.knowledge_base
  add column if not exists content_tsv tsvector;

create or replace function public.knowledge_base_build_tsv(
  p_title text,
  p_content text,
  p_category text,
  p_make text,
  p_model text,
  p_years text
)
returns tsvector
language sql
immutable
as $$
  select
    setweight(to_tsvector('english', coalesce(p_title, '')), 'A')
    || setweight(
         to_tsvector(
           'english',
           trim(
             both ' '
             from concat_ws(
               ' ',
               coalesce(p_category, ''),
               coalesce(p_make, ''),
               coalesce(p_model, ''),
               coalesce(p_years, '')
             )
           )
         ),
         'B'
       )
    || setweight(to_tsvector('english', coalesce(p_content, '')), 'C');
$$;

create or replace function public.knowledge_base_tsv_trigger()
returns trigger
language plpgsql
as $$
begin
  new.content_tsv := public.knowledge_base_build_tsv(
    new.title,
    new.content,
    new.category,
    new.vehicle_make,
    new.vehicle_model,
    new.vehicle_years
  );
  return new;
end;
$$;

drop trigger if exists knowledge_base_tsv_update on public.knowledge_base;
create trigger knowledge_base_tsv_update
  before insert or update of title, content, category, vehicle_make, vehicle_model, vehicle_years
  on public.knowledge_base
  for each row
  execute function public.knowledge_base_tsv_trigger();

-- Backfill existing rows
update public.knowledge_base
set content_tsv = public.knowledge_base_build_tsv(
  title, content, category, vehicle_make, vehicle_model, vehicle_years
)
where content_tsv is null;

create index if not exists knowledge_base_content_tsv_gin
  on public.knowledge_base using gin (content_tsv);

-- ── helpers ─────────────────────────────────────────────────────
create or replace function public.knowledge_filter_ok(
  kb_make text,
  kb_model text,
  filter jsonb
)
returns boolean
language sql
stable
as $$
  select
    (
      nullif(trim(filter->>'vehicle_make'), '') is null
      or kb_make is null
      or lower(kb_make) = lower(trim(filter->>'vehicle_make'))
    )
    and (
      nullif(trim(filter->>'vehicle_model'), '') is null
      or kb_model is null
      or lower(kb_model) = lower(trim(filter->>'vehicle_model'))
    );
$$;

-- ── Phase A: full-text search only ──────────────────────────────
create or replace function public.match_knowledge_fts(
  query_text text,
  match_count int default 5,
  filter jsonb default '{}'::jsonb
)
returns table (
  id uuid,
  title text,
  content text,
  source text,
  category text,
  vehicle_make text,
  vehicle_model text,
  vehicle_years text,
  metadata jsonb,
  similarity float
)
language plpgsql
stable
as $$
declare
  q tsquery;
  lim int := greatest(1, least(coalesce(match_count, 5), 20));
begin
  if query_text is null or length(trim(query_text)) = 0 then
    return;
  end if;

  -- plainto_tsquery is forgiving for DIY natural language
  q := plainto_tsquery('english', query_text);

  return query
  select
    kb.id,
    kb.title,
    kb.content,
    kb.source,
    kb.category,
    kb.vehicle_make,
    kb.vehicle_model,
    kb.vehicle_years,
    kb.metadata,
    ts_rank_cd(kb.content_tsv, q)::float as similarity
  from public.knowledge_base kb
  where kb.is_active = true
    and kb.content_tsv is not null
    and kb.content_tsv @@ q
    and public.knowledge_filter_ok(kb.vehicle_make, kb.vehicle_model, filter)
  order by ts_rank_cd(kb.content_tsv, q) desc, kb.updated_at desc
  limit lim;
end;
$$;

comment on function public.match_knowledge_fts is
  'RAG Phase A: English full-text search over knowledge_base (no embedding required).';

grant execute on function public.match_knowledge_fts(text, int, jsonb)
  to anon, authenticated, service_role;

-- ── Phase C: hybrid FTS + vector with RRF ───────────────────────
create or replace function public.match_knowledge_hybrid(
  query_text text,
  query_embedding vector(1536) default null,
  match_count int default 5,
  filter jsonb default '{}'::jsonb,
  rrf_k int default 60
)
returns table (
  id uuid,
  title text,
  content text,
  source text,
  category text,
  vehicle_make text,
  vehicle_model text,
  vehicle_years text,
  metadata jsonb,
  similarity float
)
language plpgsql
stable
as $$
declare
  lim int := greatest(1, least(coalesce(match_count, 5), 20));
  pool int := greatest(lim * 3, 15);
  k int := greatest(1, coalesce(rrf_k, 60));
  q tsquery := plainto_tsquery('english', 'xyzzy_no_match_token');
  has_query boolean := query_text is not null and length(trim(query_text)) > 0;
  has_vec boolean := query_embedding is not null;
begin
  if not has_query and not has_vec then
    return;
  end if;

  if has_query then
    q := plainto_tsquery('english', query_text);
  end if;

  return query
  with fts as (
    select
      kb.id,
      row_number() over (order by ts_rank_cd(kb.content_tsv, q) desc) as rank
    from public.knowledge_base kb
    where has_query
      and kb.is_active = true
      and kb.content_tsv is not null
      and kb.content_tsv @@ q
      and public.knowledge_filter_ok(kb.vehicle_make, kb.vehicle_model, filter)
    order by ts_rank_cd(kb.content_tsv, q) desc
    limit pool
  ),
  vec as (
    select
      kb.id,
      row_number() over (order by kb.embedding <=> query_embedding) as rank
    from public.knowledge_base kb
    where has_vec
      and kb.is_active = true
      and kb.embedding is not null
      and public.knowledge_filter_ok(kb.vehicle_make, kb.vehicle_model, filter)
    order by kb.embedding <=> query_embedding
    limit pool
  ),
  fused as (
    select
      coalesce(f.id, v.id) as id,
      (
        coalesce(1.0 / (k + f.rank), 0.0)
        + coalesce(1.0 / (k + v.rank), 0.0)
      )::float as rrf_score
    from fts f
    full outer join vec v on f.id = v.id
  )
  select
    kb.id,
    kb.title,
    kb.content,
    kb.source,
    kb.category,
    kb.vehicle_make,
    kb.vehicle_model,
    kb.vehicle_years,
    kb.metadata,
    fused.rrf_score as similarity
  from fused
  join public.knowledge_base kb on kb.id = fused.id
  where kb.is_active = true
  order by fused.rrf_score desc, kb.updated_at desc
  limit lim;
end;
$$;

comment on function public.match_knowledge_hybrid is
  'RAG Phase C: Reciprocal Rank Fusion of FTS + pgvector ranks (embedding optional).';

grant execute on function public.match_knowledge_hybrid(text, vector, int, jsonb, int)
  to anon, authenticated, service_role;
