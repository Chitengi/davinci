-- =============================================================
-- 004_questions_schema.sql
-- Questions + English reading passages for Supabase migration
-- Run this ONCE in your Supabase SQL editor (or via psql)
-- =============================================================

-- ---------------------------------------------------------------
-- 1.  questions
--     Stores every multiple-choice question from all subjects.
--     question_raw contains the original encoded string:
--       "[answer_letter]zxtrvy[question_text]"
--     so the existing parseQuestion() utility still works.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS questions (
  id             TEXT PRIMARY KEY,          -- e.g. "Text_only_questions__IST-Q1"
  subject_id     TEXT NOT NULL,             -- e.g. "integrated_science"
  subject_label  TEXT NOT NULL,             -- e.g. "Integrated Science"
  subtopic       TEXT NOT NULL,             -- e.g. "Text_only_questions"
  question_code  TEXT NOT NULL,             -- e.g. "IST-Q1"
  question_raw   TEXT NOT NULL,             -- full encoded string with answer prefix
  option_a       TEXT NOT NULL DEFAULT '',
  option_b       TEXT NOT NULL DEFAULT '',
  option_c       TEXT NOT NULL DEFAULT '',
  option_d       TEXT NOT NULL DEFAULT '',
  option_e       TEXT,                      -- only used by some questions
  diagram_code   TEXT,                      -- embedded [[IMG:code]] or "diagram" field
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_questions_subject_id ON questions (subject_id);
CREATE INDEX IF NOT EXISTS idx_questions_subtopic   ON questions (subject_id, subtopic);

-- ---------------------------------------------------------------
-- 2.  english_readings
--     Stores reading passages used by English comprehension.
--     passage_number matches the Pn in question codes like P1-Q3.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS english_readings (
  id             SERIAL PRIMARY KEY,
  passage_key    TEXT NOT NULL UNIQUE,      -- e.g. "Passage_1"
  passage_number INT  NOT NULL,
  title          TEXT NOT NULL DEFAULT '',
  reading_text   TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 3.  Row-Level Security (RLS)
--     Questions and readings are public read-only.
--     Writes are only done by service-role key (migrations).
-- ---------------------------------------------------------------
ALTER TABLE questions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE english_readings ENABLE ROW LEVEL SECURITY;

-- Allow anyone (including anonymous) to SELECT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'questions' AND policyname = 'Public read questions'
  ) THEN
    CREATE POLICY "Public read questions" ON questions FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'english_readings' AND policyname = 'Public read english_readings'
  ) THEN
    CREATE POLICY "Public read english_readings" ON english_readings FOR SELECT USING (true);
  END IF;
END
$$;
