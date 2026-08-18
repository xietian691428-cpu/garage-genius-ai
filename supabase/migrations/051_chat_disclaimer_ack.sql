-- Chat attention-first disclaimer cadence (separate from DeepSeek AI consent).

alter table public.profiles
  add column if not exists chat_disclaimer_ack_at timestamptz,
  add column if not exists chat_disclaimer_assistant_count_at_ack integer not null default 0;

comment on column public.profiles.chat_disclaimer_ack_at is
  'When the user last dismissed the short Chat Safety & Disclaimer banner.';
comment on column public.profiles.chat_disclaimer_assistant_count_at_ack is
  'Assistant message count (excl. welcome) when disclaimer was last dismissed — used for N-reply re-prompt.';
