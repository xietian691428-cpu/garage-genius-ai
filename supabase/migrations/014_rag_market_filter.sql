-- RAG market filter: soft-match knowledge_base.metadata.market / .region
-- against the garage vehicle market (US, EU, GB, …).
--
-- Soft rules (so existing untagged rows still retrieve):
--   • no filter.market → pass
--   • row has no market/region → pass (universal / untagged)
--   • row market in ALL|GLOBAL|ANY → pass
--   • row market/region equals filter → pass
--   • otherwise exclude (wrong-market manuals)

create or replace function public.knowledge_market_ok(
  kb_metadata jsonb,
  filter jsonb
)
returns boolean
language sql
stable
as $$
  select
    nullif(trim(coalesce(filter->>'market', '')), '') is null
    or kb_metadata is null
    or (
      nullif(
        trim(
          upper(
            coalesce(
              nullif(trim(kb_metadata->>'market'), ''),
              nullif(trim(kb_metadata->>'region'), ''),
              ''
            )
          )
        ),
        ''
      ) is null
    )
    or upper(
      coalesce(
        nullif(trim(kb_metadata->>'market'), ''),
        nullif(trim(kb_metadata->>'region'), ''),
        ''
      )
    ) in ('ALL', 'GLOBAL', 'ANY')
    or upper(
      coalesce(
        nullif(trim(kb_metadata->>'market'), ''),
        nullif(trim(kb_metadata->>'region'), ''),
        ''
      )
    ) = upper(trim(filter->>'market'))
    or (
      nullif(trim(coalesce(filter->>'region', '')), '') is not null
      and upper(coalesce(nullif(trim(kb_metadata->>'region'), ''), ''))
        = upper(trim(filter->>'region'))
    );
$$;

comment on function public.knowledge_market_ok is
  'Soft RAG market gate: keep untagged / global rows; drop explicit wrong-market docs.';

-- Extend make/model helper to also accept metadata (keeps old 3-arg callers working via overload).
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

create or replace function public.knowledge_filter_ok(
  kb_make text,
  kb_model text,
  kb_metadata jsonb,
  filter jsonb
)
returns boolean
language sql
stable
as $$
  select
    public.knowledge_filter_ok(kb_make, kb_model, filter)
    and public.knowledge_market_ok(kb_metadata, filter);
$$;

-- FTS: pass metadata into filter helper
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
    and public.knowledge_filter_ok(
      kb.vehicle_make,
      kb.vehicle_model,
      kb.metadata,
      filter
    )
  order by ts_rank_cd(kb.content_tsv, q) desc, kb.updated_at desc
  limit lim;
end;
$$;

-- Hybrid: same market-aware filter on both FTS and vector pools
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
      and public.knowledge_filter_ok(
        kb.vehicle_make,
        kb.vehicle_model,
        kb.metadata,
        filter
      )
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
      and public.knowledge_filter_ok(
        kb.vehicle_make,
        kb.vehicle_model,
        kb.metadata,
        filter
      )
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

-- Legacy vector path
create or replace function public.match_documents(
  query_embedding vector(1536),
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
begin
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
    (1 - (kb.embedding <=> query_embedding))::float as similarity
  from public.knowledge_base kb
  where kb.is_active = true
    and kb.embedding is not null
    and public.knowledge_filter_ok(
      kb.vehicle_make,
      kb.vehicle_model,
      kb.metadata,
      filter
    )
  order by kb.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
end;
$$;

comment on function public.match_documents is
  'RAG: top-k by embedding distance; optional make/model + soft metadata.market filter.';

-- Helpful expression indexes for future hard-market queries
create index if not exists knowledge_base_metadata_market_idx
  on public.knowledge_base ((metadata->>'market'));

create index if not exists knowledge_base_metadata_region_idx
  on public.knowledge_base ((metadata->>'region'));
