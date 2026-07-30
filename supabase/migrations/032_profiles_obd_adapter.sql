-- Optional OBD adapter preference on profiles (user-level hardware flag).
-- Default false + source 'default' = unset until self-report / Settings / first Connect prompt.

alter table public.profiles
  add column if not exists has_obd_adapter boolean not null default false;

alter table public.profiles
  add column if not exists has_obd_adapter_source text not null default 'default'
    check (has_obd_adapter_source in ('default', 'self'));

alter table public.profiles
  add column if not exists has_obd_adapter_updated_at timestamptz;

comment on column public.profiles.has_obd_adapter is
  'User owns / uses an OBD-II scanner or BLE adapter. Softens Connect OBD prompts when false.';

comment on column public.profiles.has_obd_adapter_source is
  'default = not yet chosen; self = Settings / onboarding / first-connect prompt.';
