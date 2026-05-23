-- Migration 006: Add learner profile fields (grade, PIN, guardian contact)
-- Run this in Supabase SQL editor

-- Add profile columns to learners table
alter table public.learners
  add column if not exists grade smallint check (grade in (5, 6, 7)),
  add column if not exists pin_hash text,
  add column if not exists guardian_phone text,
  add column if not exists registered_at timestamptz;

-- Index for guardian phone lookups (account recovery)
create index if not exists ix_learners_guardian_phone
  on public.learners(guardian_phone)
  where guardian_phone is not null;
