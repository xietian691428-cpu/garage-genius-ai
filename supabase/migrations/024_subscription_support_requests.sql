-- Subscription Support Coach: human-reviewed refund / billing requests
-- Refunds must NEVER auto-execute from the user-facing coach.

create table if not exists public.subscription_support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null
    check (kind in ('refund', 'invoice_resend', 'cancel_help', 'payment_update', 'renewal_failed')),
  status text not null default 'pending_human'
    check (status in ('pending_human', 'approved', 'rejected', 'completed', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_invoice_id text,
  stripe_charge_id text,
  stripe_refund_id text,
  amount_cents integer not null default 0,
  currency text not null default 'usd',
  reason text,
  admin_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  client_session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscription_support_requests_user_idx
  on public.subscription_support_requests (user_id, created_at desc);
create index if not exists subscription_support_requests_status_idx
  on public.subscription_support_requests (status, created_at desc);

alter table public.subscription_support_requests enable row level security;

drop policy if exists "Users read own support requests" on public.subscription_support_requests;
create policy "Users read own support requests"
  on public.subscription_support_requests for select to authenticated
  using (auth.uid() = user_id);

-- Inserts / updates go through service role from API routes (no direct client write for refunds)

comment on table public.subscription_support_requests is
  'Billing support coach queue. Refunds require admin approveAndExecuteRefund before Stripe.refunds.create.';
