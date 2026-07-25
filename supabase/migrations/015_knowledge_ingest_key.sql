-- Optional uniqueness for owner-manual ingest keys (idempotent imports).
-- Uses expression index on metadata->>'ingest_key' when present.

create unique index if not exists knowledge_base_ingest_key_uidx
  on public.knowledge_base ((metadata->>'ingest_key'))
  where metadata ? 'ingest_key'
    and nullif(trim(metadata->>'ingest_key'), '') is not null;

comment on index public.knowledge_base_ingest_key_uidx is
  'Idempotent owner-manual / knowledge ingest: metadata.ingest_key must be unique when set.';
