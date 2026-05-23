#!/usr/bin/env node
/**
 * scripts/generate-questions-sql.mjs
 *
 * Reads all subject JSON files from src/data/ and outputs an SQL file
 * (backend/sql/005_seed_questions.sql) with INSERT statements for the
 * `questions` and `english_readings` tables created by 004_questions_schema.sql.
 *
 * Usage:
 *   node scripts/generate-questions-sql.mjs
 *
 * The output file can then be run in the Supabase SQL editor or via psql.
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'src', 'data')
const OUT_FILE = path.join(ROOT, 'backend', 'sql', '005_seed_questions.sql')

// ── helpers ────────────────────────────────────────────────────────────────

const esc = (str) =>
  typeof str === 'string' ? `'${str.replace(/'/g, "''")}'` : 'NULL'

const escOrNull = (str) =>
  str && String(str).trim() ? esc(String(str).trim()) : 'NULL'

const SEPARATOR = 'zxtrvy'

// Subject configuration — mirrors subjects.js
const SUBJECTS = [
  { id: 'mathematics',       label: 'Mathematics',        file: 'mathematics.json' },
  { id: 'integrated_science',label: 'Integrated Science', file: 'integratedScience.json' },
  { id: 'social_studies',    label: 'Social Studies',     file: 'socialStudies.json' },
  { id: 'home_economics',    label: 'Home Economics',     file: 'homeEconomics.json' },
  { id: 'music',             label: 'Music',              file: 'music.json' },
  { id: 'basic_ict',         label: 'Basic ICT',          file: 'basicIct.json' },
  { id: 'english',           label: 'English',            file: 'english.json' },
  { id: 'special_paper_1',   label: 'Special Paper 1',    file: 'specialPaper1.json' },
  { id: 'special_paper_2',   label: 'Special Paper 2',    file: 'specialPaper2.json' },
]

// English reading passages are stored separately
const READINGS_FILE = 'english_readings.json'
const READINGS_KEY  = '_G5-G7_ENGLISH_READINGS'

// ── process English reading passages ──────────────────────────────────────

function buildReadingsInserts() {
  const filePath = path.join(DATA_DIR, READINGS_FILE)
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const container = raw[READINGS_KEY] || raw['_G5_G7_ENGLISH_READINGS']
  if (!container) {
    console.warn('⚠️  Could not find English readings container')
    return []
  }

  const inserts = []
  for (const [passageKey, block] of Object.entries(container)) {
    const match = passageKey.match(/^Passage_(\d+)$/i)
    if (!match) continue
    const passageNumber = Number(match[1])
    const title = String(block.Title || '').trim()

    // Find the reading text (Reading-1 / reading-1)
    let text = ''
    for (const [k, v] of Object.entries(block)) {
      if (k.toLowerCase() === 'reading-1' && typeof v === 'string') {
        text = v.trim()
        break
      }
    }

    inserts.push(
      `INSERT INTO english_readings (passage_key, passage_number, title, reading_text)\n` +
      `VALUES (${esc(passageKey)}, ${passageNumber}, ${esc(title)}, ${esc(text)})\n` +
      `ON CONFLICT (passage_key) DO UPDATE SET title = EXCLUDED.title, reading_text = EXCLUDED.reading_text;`
    )
  }
  return inserts
}

// ── build English reading-comprehension question rows ─────────────────────
// These are stored in english_readings.json inside each passage block.

function buildEnglishReadingQuestionsInserts() {
  const filePath = path.join(DATA_DIR, READINGS_FILE)
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const container = raw[READINGS_KEY] || raw['_G5_G7_ENGLISH_READINGS']
  if (!container) return []

  const inserts = []
  for (const [passageKey, block] of Object.entries(container)) {
    const passageMatch = passageKey.match(/^Passage_(\d+)$/i)
    if (!passageMatch) continue

    for (const [qCode, qData] of Object.entries(block)) {
      if (!/^P\d+-Q\d+$/i.test(qCode)) continue
      if (!qData || typeof qData !== 'object') continue

      const questionRaw = String(qData.Question || '').trim()
      const id = `${passageKey}-${qCode}` // e.g. Passage_1-P1-Q1

      // Extract diagram
      let diagramCode = null
      const diagramMatch = questionRaw.match(/\[\[IMG:([^\]]+)\]\]/)
      if (diagramMatch) diagramCode = diagramMatch[1]
      if (!diagramCode && qData.diagram) diagramCode = String(qData.diagram).trim() || null

      inserts.push(
        `INSERT INTO questions (id, subject_id, subject_label, subtopic, question_code, question_raw, option_a, option_b, option_c, option_d, option_e, diagram_code)\n` +
        `VALUES (${esc(id)}, 'english', 'English', 'Reading_Comprehension', ${esc(qCode)}, ${esc(questionRaw)}, ` +
        `${esc(qData.a || '')}, ${esc(qData.b || '')}, ${esc(qData.c || '')}, ${esc(qData.d || '')}, ` +
        `${escOrNull(qData.e)}, ${escOrNull(diagramCode)})\n` +
        `ON CONFLICT (id) DO UPDATE SET question_raw = EXCLUDED.question_raw, option_a = EXCLUDED.option_a, ` +
        `option_b = EXCLUDED.option_b, option_c = EXCLUDED.option_c, option_d = EXCLUDED.option_d, ` +
        `option_e = EXCLUDED.option_e, diagram_code = EXCLUDED.diagram_code;`
      )
    }
  }
  return inserts
}

// ── process subject JSON files ─────────────────────────────────────────────

function buildSubjectInserts(subjectId, subjectLabel, jsonFile) {
  const filePath = path.join(DATA_DIR, jsonFile)
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))

  const subjectKey = Object.keys(raw)[0]
  if (!subjectKey) return []

  const subtopics = raw[subjectKey]
  const inserts = []

  for (const [subtopicKey, questions] of Object.entries(subtopics)) {
    if (!questions || typeof questions !== 'object') continue

    for (const [questionCode, qData] of Object.entries(questions)) {
      if (!qData || typeof qData !== 'object') continue

      const questionRaw = String(qData.Question || '').trim()
      if (!questionRaw) continue

      const id = `${subtopicKey}__${questionCode}`

      // Extract optional diagram from embedded [[IMG:...]] or "diagram" field
      let diagramCode = null
      const diagramMatch = questionRaw.match(/\[\[IMG:([^\]]+)\]\]/)
      if (diagramMatch) diagramCode = diagramMatch[1]
      if (!diagramCode && qData.diagram) diagramCode = String(qData.diagram).trim() || null

      inserts.push(
        `INSERT INTO questions (id, subject_id, subject_label, subtopic, question_code, question_raw, option_a, option_b, option_c, option_d, option_e, diagram_code)\n` +
        `VALUES (${esc(id)}, ${esc(subjectId)}, ${esc(subjectLabel)}, ${esc(subtopicKey)}, ${esc(questionCode)}, ` +
        `${esc(questionRaw)}, ${esc(qData.a || '')}, ${esc(qData.b || '')}, ${esc(qData.c || '')}, ${esc(qData.d || '')}, ` +
        `${escOrNull(qData.e)}, ${escOrNull(diagramCode)})\n` +
        `ON CONFLICT (id) DO UPDATE SET question_raw = EXCLUDED.question_raw, option_a = EXCLUDED.option_a, ` +
        `option_b = EXCLUDED.option_b, option_c = EXCLUDED.option_c, option_d = EXCLUDED.option_d, ` +
        `option_e = EXCLUDED.option_e, diagram_code = EXCLUDED.diagram_code;`
      )
    }
  }

  return inserts
}

// ── main ───────────────────────────────────────────────────────────────────

console.log('📦 Generating SQL seed from JSON data files...\n')

const lines = [
  '-- =============================================================',
  '-- 005_seed_questions.sql  (auto-generated — do not edit by hand)',
  '-- Run AFTER 004_questions_schema.sql',
  `-- Generated: ${new Date().toISOString()}`,
  '-- =============================================================',
  '',
  '-- Reading passages',
]

const readingsInserts = buildReadingsInserts()
lines.push(...readingsInserts)
lines.push('')
console.log(`✅  ${readingsInserts.length} reading passage rows`)

const englishReadingQInserts = buildEnglishReadingQuestionsInserts()
lines.push('-- English Reading Comprehension questions (from english_readings.json)')
lines.push(...englishReadingQInserts)
lines.push('')
console.log(`✅  ${englishReadingQInserts.length} English reading comprehension questions`)

for (const { id, label, file } of SUBJECTS) {
  const subjectInserts = buildSubjectInserts(id, label, file)
  lines.push(`-- ${label} (${file})`)
  lines.push(...subjectInserts)
  lines.push('')
  console.log(`✅  ${subjectInserts.length} rows  →  ${label}`)
}

fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8')
console.log(`\n🎉 Written to: ${OUT_FILE}`)
