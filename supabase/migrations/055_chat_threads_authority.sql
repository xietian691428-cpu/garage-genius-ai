-- Chat threads: server-authoritative history per user + vehicle.
-- vehicle_id on a thread is immutable. Messages must match thread.vehicle_id.

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.user_vehicles (id) on delete cascade,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz,
  closed_at timestamptz
);

create index if not exists chat_threads_user_vehicle_open_idx
  on public.chat_threads (user_id, vehicle_id, updated_at desc)
  where closed_at is null;

create index if not exists chat_threads_user_idx
  on public.chat_threads (user_id, updated_at desc);

alter table public.chat_messages
  add column if not exists thread_id uuid references public.chat_threads (id) on delete cascade;

create index if not exists chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at);

-- Immutable vehicle_id on threads
create or replace function public.chat_threads_forbid_vehicle_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.vehicle_id is distinct from old.vehicle_id then
    raise exception 'chat_threads.vehicle_id is immutable';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists chat_threads_forbid_vehicle_change on public.chat_threads;
create trigger chat_threads_forbid_vehicle_change
  before update on public.chat_threads
  for each row
  execute function public.chat_threads_forbid_vehicle_change();

-- Message insert/update must stay on the thread's vehicle + owner
create or replace function public.chat_messages_enforce_thread_vehicle()
returns trigger
language plpgsql
as $$
declare
  t_user uuid;
  t_vehicle uuid;
begin
  if new.thread_id is null then
    return new;
  end if;
  select user_id, vehicle_id into t_user, t_vehicle
  from public.chat_threads
  where id = new.thread_id;
  if t_user is null then
    raise exception 'chat_messages.thread_id not found';
  end if;
  if new.user_id is distinct from t_user then
    raise exception 'chat_messages.user_id must match thread.user_id';
  end if;
  if new.vehicle_id is distinct from t_vehicle then
    raise exception 'chat_messages.vehicle_id must match thread.vehicle_id';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_messages_enforce_thread_vehicle on public.chat_messages;
create trigger chat_messages_enforce_thread_vehicle
  before insert or update on public.chat_messages
  for each row
  execute function public.chat_messages_enforce_thread_vehicle();

alter table public.chat_threads enable row level security;

drop policy if exists "Users can read own chat threads" on public.chat_threads;
create policy "Users can read own chat threads"
  on public.chat_threads for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own chat threads" on public.chat_threads;
create policy "Users can insert own chat threads"
  on public.chat_threads for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own chat threads" on public.chat_threads;
create policy "Users can update own chat threads"
  on public.chat_threads for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own chat threads" on public.chat_threads;
create policy "Users can delete own chat threads"
  on public.chat_threads for delete to authenticated
  using (auth.uid() = user_id);

-- Backfill: one open thread per (user_id, vehicle_id) that already has messages
insert into public.chat_threads (user_id, vehicle_id, created_at, updated_at, last_message_at)
select
  m.user_id,
  m.vehicle_id,
  min(m.created_at),
  max(m.created_at),
  max(m.created_at)
from public.chat_messages m
where m.thread_id is null
  and not exists (
    select 1
    from public.chat_threads t
    where t.user_id = m.user_id
      and t.vehicle_id = m.vehicle_id
      and t.closed_at is null
  )
group by m.user_id, m.vehicle_id;

-- Attach orphan messages to the latest matching thread for that user+vehicle
update public.chat_messages m
set thread_id = t.id
from public.chat_threads t
where m.thread_id is null
  and t.user_id = m.user_id
  and t.vehicle_id = m.vehicle_id
  and t.closed_at is null;

comment on table public.chat_threads is
  'Per-user chat threads bound to one vehicle_id (immutable). Server assembles model history from thread messages.';
comment on column public.chat_messages.thread_id is
  'Owning chat_threads row; vehicle_id must match thread.vehicle_id.';
