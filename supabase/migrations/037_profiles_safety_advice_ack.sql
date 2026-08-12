-- Account-level acknowledgment for first high-tier safety / insurance education gate.
-- Once true, high-tier content no longer shows the one-time understanding checkbox.

alter table public.profiles
  add column if not exists has_acknowledged_safety_advice boolean not null default false;

comment on column public.profiles.has_acknowledged_safety_advice is
  'User acknowledged educational-only / not insurance advice on first high-tier coach or safety topic.';
