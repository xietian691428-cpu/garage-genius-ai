-- Private per-vehicle owner's manuals (user_id × vehicle_id only).
-- Never written to knowledge_base / global RAG.

create extension if not exists vector;

create table if not exists public.vehicle_manuals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.user_vehicles (id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  file_size integer not null check (file_size > 0),
  page_count integer,
  status text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  error_message text,
  ymm_guess jsonb,
  ymm_match text not null default 'unknown'
    check (ymm_match in ('match', 'mismatch', 'unknown')),
  user_confirmed_match boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- One active (non-deleted) manual per user×vehicle
create unique index if not exists vehicle_manuals_one_active_per_vehicle_idx
  on public.vehicle_manuals (user_id, vehicle_id)
  where deleted_at is null;

create index if not exists vehicle_manuals_user_vehicle_idx
  on public.vehicle_manuals (user_id, vehicle_id, updated_at desc)
  where deleted_at is null;

create table if not exists public.vehicle_manual_chunks (
  id uuid primary key default gen_random_uuid(),
  manual_id uuid not null references public.vehicle_manuals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.user_vehicles (id) on delete cascade,
  chunk_index integer not null,
  page_from integer,
  page_to integer,
  heading text,
  content text not null,
  content_tsv tsvector,
  embedding vector(1536),
  created_at timestamptz not null default now(),
  constraint vehicle_manual_chunks_user_vehicle_required
    check (user_id is not null and vehicle_id is not null)
);

create index if not exists vehicle_manual_chunks_lookup_idx
  on public.vehicle_manual_chunks (user_id, vehicle_id, manual_id);

create index if not exists vehicle_manual_chunks_tsv_idx
  on public.vehicle_manual_chunks using gin (content_tsv);

create or replace function public.vehicle_manual_chunks_tsv_update()
returns trigger
language plpgsql
as $$
begin
  new.content_tsv :=
    setweight(to_tsvector('english', coalesce(new.heading, '')), 'A')
    || setweight(to_tsvector('english', coalesce(new.content, '')), 'B');
  return new;
end;
$$;

drop trigger if exists vehicle_manual_chunks_tsv_update on public.vehicle_manual_chunks;
create trigger vehicle_manual_chunks_tsv_update
  before insert or update of heading, content
  on public.vehicle_manual_chunks
  for each row
  execute function public.vehicle_manual_chunks_tsv_update();

create or replace function public.vehicle_manuals_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicle_manuals_touch_updated_at on public.vehicle_manuals;
create trigger vehicle_manuals_touch_updated_at
  before update on public.vehicle_manuals
  for each row
  execute function public.vehicle_manuals_touch_updated_at();

-- Chunks must always match parent manual ownership
create or replace function public.vehicle_manual_chunks_enforce_owner()
returns trigger
language plpgsql
as $$
declare
  m_user uuid;
  m_vehicle uuid;
  m_deleted timestamptz;
begin
  select user_id, vehicle_id, deleted_at
    into m_user, m_vehicle, m_deleted
  from public.vehicle_manuals
  where id = new.manual_id;

  if m_user is null then
    raise exception 'vehicle_manual_chunks.manual_id not found';
  end if;
  if m_deleted is not null then
    raise exception 'cannot write chunks for a deleted manual';
  end if;
  if new.user_id is distinct from m_user then
    raise exception 'vehicle_manual_chunks.user_id must match manual.user_id';
  end if;
  if new.vehicle_id is distinct from m_vehicle then
    raise exception 'vehicle_manual_chunks.vehicle_id must match manual.vehicle_id';
  end if;
  return new;
end;
$$;

drop trigger if exists vehicle_manual_chunks_enforce_owner on public.vehicle_manual_chunks;
create trigger vehicle_manual_chunks_enforce_owner
  before insert or update on public.vehicle_manual_chunks
  for each row
  execute function public.vehicle_manual_chunks_enforce_owner();

alter table public.vehicle_manuals enable row level security;
alter table public.vehicle_manual_chunks enable row level security;

drop policy if exists vehicle_manuals_select_own on public.vehicle_manuals;
create policy vehicle_manuals_select_own
  on public.vehicle_manuals for select
  using (auth.uid() = user_id and deleted_at is null);

drop policy if exists vehicle_manuals_insert_own on public.vehicle_manuals;
create policy vehicle_manuals_insert_own
  on public.vehicle_manuals for insert
  with check (auth.uid() = user_id);

drop policy if exists vehicle_manuals_update_own on public.vehicle_manuals;
create policy vehicle_manuals_update_own
  on public.vehicle_manuals for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists vehicle_manual_chunks_select_own on public.vehicle_manual_chunks;
create policy vehicle_manual_chunks_select_own
  on public.vehicle_manual_chunks for select
  using (auth.uid() = user_id);

drop policy if exists vehicle_manual_chunks_insert_own on public.vehicle_manual_chunks;
create policy vehicle_manual_chunks_insert_own
  on public.vehicle_manual_chunks for insert
  with check (auth.uid() = user_id);

drop policy if exists vehicle_manual_chunks_delete_own on public.vehicle_manual_chunks;
create policy vehicle_manual_chunks_delete_own
  on public.vehicle_manual_chunks for delete
  using (auth.uid() = user_id);

-- Private storage bucket (path: {user_id}/{vehicle_id}/{manual_id}.pdf)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'vehicle-manuals',
  'vehicle-manuals',
  false,
  52428800,
  array['application/pdf']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists vehicle_manuals_storage_select on storage.objects;
create policy vehicle_manuals_storage_select
  on storage.objects for select
  using (
    bucket_id = 'vehicle-manuals'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists vehicle_manuals_storage_insert on storage.objects;
create policy vehicle_manuals_storage_insert
  on storage.objects for insert
  with check (
    bucket_id = 'vehicle-manuals'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists vehicle_manuals_storage_update on storage.objects;
create policy vehicle_manuals_storage_update
  on storage.objects for update
  using (
    bucket_id = 'vehicle-manuals'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists vehicle_manuals_storage_delete on storage.objects;
create policy vehicle_manuals_storage_delete
  on storage.objects for delete
  using (
    bucket_id = 'vehicle-manuals'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- FTS retrieve for one user×vehicle (never cross-user)
create or replace function public.match_vehicle_manual_chunks(
  p_user_id uuid,
  p_vehicle_id uuid,
  p_query text,
  p_limit int default 4
)
returns table (
  id uuid,
  manual_id uuid,
  page_from int,
  page_to int,
  heading text,
  content text,
  rank real
)
language sql
stable
security invoker
as $$
  select
    c.id,
    c.manual_id,
    c.page_from,
    c.page_to,
    c.heading,
    c.content,
    ts_rank(c.content_tsv, websearch_to_tsquery('english', p_query))::real as rank
  from public.vehicle_manual_chunks c
  join public.vehicle_manuals m on m.id = c.manual_id
  where c.user_id = p_user_id
    and c.vehicle_id = p_vehicle_id
    and m.user_id = p_user_id
    and m.vehicle_id = p_vehicle_id
    and m.deleted_at is null
    and m.status = 'ready'
    and (
      m.ymm_match = 'match'
      or m.user_confirmed_match = true
      or m.ymm_match = 'unknown'
    )
    and c.content_tsv @@ websearch_to_tsquery('english', p_query)
  order by rank desc
  limit greatest(1, least(coalesce(p_limit, 4), 8));
$$;

revoke all on function public.match_vehicle_manual_chunks(uuid, uuid, text, int) from public;
grant execute on function public.match_vehicle_manual_chunks(uuid, uuid, text, int)
  to authenticated, service_role;
