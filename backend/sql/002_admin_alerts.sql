create extension if not exists pgcrypto;

create table if not exists public.admin_alerts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'urgent')),
  audience text not null default 'all',
  created_at timestamptz not null default now()
);

create index if not exists ix_admin_alerts_created_at on public.admin_alerts(created_at desc);
