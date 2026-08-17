-- Apple IAP entitlement fields + third-party AI (DeepSeek) consent.
-- Billing fields remain service-role only (protect_profile_billing_fields).

alter table public.profiles
  add column if not exists billing_provider text
    check (billing_provider is null or billing_provider in ('stripe', 'apple')),
  add column if not exists apple_original_transaction_id text,
  add column if not exists apple_product_id text,
  add column if not exists apple_environment text
    check (apple_environment is null or apple_environment in ('Sandbox', 'Production')),
  add column if not exists has_acknowledged_ai_consent boolean not null default false,
  add column if not exists ai_consent_at timestamptz;

create unique index if not exists profiles_apple_original_transaction_id_uidx
  on public.profiles (apple_original_transaction_id)
  where apple_original_transaction_id is not null;

comment on column public.profiles.billing_provider is
  'Primary paid billing channel: stripe (web) or apple (App Store IAP).';
comment on column public.profiles.apple_original_transaction_id is
  'Apple StoreKit originalTransactionId for the active auto-renewable subscription.';
comment on column public.profiles.apple_product_id is
  'Last verified Apple product id (pro/heavy monthly/yearly).';
comment on column public.profiles.has_acknowledged_ai_consent is
  'User consented to send repair data to DeepSeek before first AI call.';
comment on column public.profiles.ai_consent_at is
  'When the user last accepted third-party AI (DeepSeek) processing.';

-- Extend billing-field protection to Apple columns (clients cannot self-grant Pro).
create or replace function public.protect_profile_billing_fields()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.bypass_billing_protect', true) = 'on' then
    return new;
  end if;
  if auth.role() = 'authenticated' then
    new.subscription_status := old.subscription_status;
    new.stripe_customer_id := old.stripe_customer_id;
    new.stripe_subscription_id := old.stripe_subscription_id;
    new.trial_ends_at := old.trial_ends_at;
    new.current_period_end := old.current_period_end;
    new.billing_provider := old.billing_provider;
    new.apple_original_transaction_id := old.apple_original_transaction_id;
    new.apple_product_id := old.apple_product_id;
    new.apple_environment := old.apple_environment;
  end if;
  return new;
end;
$$;

-- Mirror table for Apple transactions (admin / support).
create table if not exists public.apple_transactions (
  id bigserial primary key,
  user_id uuid references public.profiles (id) on delete set null,
  original_transaction_id text not null,
  transaction_id text not null,
  product_id text not null,
  environment text,
  expires_date timestamptz,
  revoked boolean not null default false,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists apple_transactions_transaction_id_uidx
  on public.apple_transactions (transaction_id);

create index if not exists apple_transactions_original_idx
  on public.apple_transactions (original_transaction_id);

create index if not exists apple_transactions_user_idx
  on public.apple_transactions (user_id);

alter table public.apple_transactions enable row level security;

drop policy if exists apple_transactions_service_only on public.apple_transactions;
-- No policies for authenticated → service role only via bypass RLS.
