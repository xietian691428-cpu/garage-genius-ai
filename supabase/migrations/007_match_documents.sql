-- Vector similarity search for knowledge_base (RAG chat retrieval).

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
declare
  v_make text := nullif(trim(filter->>'vehicle_make'), '');
  v_model text := nullif(trim(filter->>'vehicle_model'), '');
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
    and (
      v_make is null
      or kb.vehicle_make is null
      or lower(kb.vehicle_make) = lower(v_make)
    )
    and (
      v_model is null
      or kb.vehicle_model is null
      or lower(kb.vehicle_model) = lower(v_model)
    )
  order by kb.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
end;
$$;

comment on function public.match_documents is
  'RAG: top-k knowledge_base rows by embedding distance, optional make/model filter.';

grant execute on function public.match_documents(vector, int, jsonb) to anon, authenticated, service_role;
