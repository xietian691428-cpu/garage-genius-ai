-- Chat transcripts + maintenance logs, scoped by user_id + vehicle_id.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.user_vehicles (id) on delete cascade,
  client_message_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  image text,
  created_at timestamptz not null default now(),
  constraint chat_messages_client_unique unique (user_id, vehicle_id, client_message_id)
);

create index if not exists chat_messages_vehicle_created_idx
  on public.chat_messages (vehicle_id, created_at);

create index if not exists chat_messages_user_vehicle_idx
  on public.chat_messages (user_id, vehicle_id);

create table if not exists public.maintenance_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.user_vehicles (id) on delete cascade,
  title text not null,
  category text not null default 'general',
  description text,
  mileage integer,
  cost_cents integer,
  parts_used jsonb not null default '[]'::jsonb,
  performed_at date not null default (current_date),
  source text not null default 'manual'
    check (source in ('manual', 'chat', 'parts')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_records_mileage_check
    check (mileage is null or mileage >= 0),
  constraint maintenance_records_cost_check
    check (cost_cents is null or cost_cents >= 0)
);

create index if not exists maintenance_records_vehicle_performed_idx
  on public.maintenance_records (vehicle_id, performed_at desc);

create index if not exists maintenance_records_user_vehicle_idx
  on public.maintenance_records (user_id, vehicle_id);

create or replace function public.set_maintenance_records_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists maintenance_records_set_updated_at on public.maintenance_records;
create trigger maintenance_records_set_updated_at
  before update on public.maintenance_records
  for each row
  execute function public.set_maintenance_records_updated_at();

alter table public.chat_messages enable row level security;
alter table public.maintenance_records enable row level security;

drop policy if exists "Users can read own chat messages" on public.chat_messages;
create policy "Users can read own chat messages"
  on public.chat_messages for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own chat messages" on public.chat_messages;
create policy "Users can insert own chat messages"
  on public.chat_messages for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own chat messages" on public.chat_messages;
create policy "Users can update own chat messages"
  on public.chat_messages for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own chat messages" on public.chat_messages;
create policy "Users can delete own chat messages"
  on public.chat_messages for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can read own maintenance" on public.maintenance_records;
create policy "Users can read own maintenance"
  on public.maintenance_records for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own maintenance" on public.maintenance_records;
create policy "Users can insert own maintenance"
  on public.maintenance_records for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own maintenance" on public.maintenance_records;
create policy "Users can update own maintenance"
  on public.maintenance_records for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own maintenance" on public.maintenance_records;
create policy "Users can delete own maintenance"
  on public.maintenance_records for delete to authenticated
  using (auth.uid() = user_id);

comment on table public.chat_messages is
  'Per-vehicle chat transcripts (user_id + vehicle_id).';
comment on table public.maintenance_records is
  'Per-vehicle maintenance history (Pro feature; free preview limited in app).';
