-- Admin ops console: staff roles, audit log, customer CRM fields.
-- Env ADMIN_EMAIL remains the bootstrap super-admin login.

create table if not exists public.admin_staff (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  display_name text,
  role text not null default 'ops'
    check (role in ('super_admin', 'ops', 'support')),
  is_active boolean not null default true,
  modules text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_staff_role_idx on public.admin_staff (role);

comment on table public.admin_staff is
  'Backend console users (roles). Bootstrap login still uses ADMIN_EMAIL env.';

create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_email text,
  action text not null,
  module text not null,
  target_type text,
  target_id text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_module_idx
  on public.admin_audit_logs (module, created_at desc);

create table if not exists public.customer_crm (
  user_id uuid primary key references auth.users (id) on delete cascade,
  tags text[] not null default '{}',
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_crm_archived_idx
  on public.customer_crm (archived_at);

create index if not exists customer_crm_tags_idx
  on public.customer_crm using gin (tags);

-- Service role / admin only (no end-user policies)
alter table public.admin_staff enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.customer_crm enable row level security;
