-- One-time early-access welcome note (App Store / web first-run).
-- Clicking Got it sets has_seen_welcome_note = true; never show again for that user.

alter table public.profiles
  add column if not exists has_seen_welcome_note boolean not null default false;

comment on column public.profiles.has_seen_welcome_note is
  'User dismissed the early-access welcome / co-create note. Once true, never show again.';
