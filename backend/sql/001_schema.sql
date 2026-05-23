-- PostgreSQL/Supabase schema for UPPS subscriptions and payments
create extension if not exists pgcrypto;

create table if not exists public.learners (
  id uuid primary key default gen_random_uuid(),
  external_id uuid not null unique,
  auth_user_id uuid unique,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  amount_zmw numeric(10, 2) not null check (amount_zmw > 0),
  currency char(3) not null default 'ZMW',
  billing_cycle text not null check (billing_cycle in ('monthly', 'yearly')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null check (status in ('trialing', 'active', 'past_due', 'pending_payment', 'canceled', 'expired')),
  starts_at timestamptz,
  ends_at timestamptz,
  canceled_at timestamptz,
  provider_customer_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ux_subscription_single_open
  on public.subscriptions(learner_id)
  where status in ('trialing', 'active', 'past_due', 'pending_payment');

create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  learner_id uuid not null references public.learners(id) on delete cascade,
  plan_id uuid not null references public.subscription_plans(id),
  subscription_id uuid references public.subscriptions(id) on delete set null,
  provider text not null check (provider in ('airtel_money', 'mtn_money', 'zamtel_konnect', 'card', 'test')),
  provider_reference text unique,
  phone_number text,
  amount_zmw numeric(10, 2) not null check (amount_zmw > 0),
  currency char(3) not null default 'ZMW',
  status text not null check (status in ('initiated', 'pending', 'paid', 'failed', 'canceled', 'expired')),
  checkout_url text,
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  failed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ix_payment_learner_requested_at on public.payment_transactions(learner_id, requested_at desc);
create index if not exists ix_payment_provider_ref on public.payment_transactions(provider_reference);

create table if not exists public.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid references public.payment_transactions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists tr_subscriptions_updated_at on public.subscriptions;
create trigger tr_subscriptions_updated_at
before update on public.subscriptions
for each row
execute function public.set_updated_at();

insert into public.subscription_plans (code, name, description, amount_zmw, currency, billing_cycle)
values
  ('monthly_2', 'Monthly Access', 'Full access for 30 days at K2', 2.00, 'ZMW', 'monthly'),
  ('yearly_20', 'Annual Access', 'Full access for 365 days at K20', 20.00, 'ZMW', 'yearly')
on conflict (code) do update
set
  name = excluded.name,
  description = excluded.description,
  amount_zmw = excluded.amount_zmw,
  currency = excluded.currency,
  billing_cycle = excluded.billing_cycle,
  is_active = true;

-- Optional Supabase RLS setup (safe even if not using direct client access)
alter table public.learners enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_transactions enable row level security;

-- If using Supabase auth, store auth_user_id in learners and apply these policies.
drop policy if exists learners_select_own on public.learners;
create policy learners_select_own on public.learners
for select
using (auth.uid() = auth_user_id);

drop policy if exists subscriptions_select_own on public.subscriptions;
create policy subscriptions_select_own on public.subscriptions
for select
using (
  exists (
    select 1
    from public.learners l
    where l.id = subscriptions.learner_id and l.auth_user_id = auth.uid()
  )
);

drop policy if exists payments_select_own on public.payment_transactions;
create policy payments_select_own on public.payment_transactions
for select
using (
  exists (
    select 1
    from public.learners l
    where l.id = payment_transactions.learner_id and l.auth_user_id = auth.uid()
  )
);
