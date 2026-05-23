-- Migration 007: Free-tier daily question quota tracking
-- Run this in Supabase SQL editor

create table if not exists public.learner_daily_question_usage (
  learner_id uuid not null references public.learners(id) on delete cascade,
  usage_date date not null,
  questions_served integer not null default 0 check (questions_served >= 0),
  updated_at timestamptz not null default now(),
  primary key (learner_id, usage_date)
);

create index if not exists ix_daily_question_usage_date
  on public.learner_daily_question_usage(usage_date desc);
