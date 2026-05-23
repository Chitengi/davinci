import { useState, useEffect, useRef } from 'react'
import { SUBJECTS } from '../utils/subjects'
import { shuffleQuestionOptions } from '../utils/shuffleQuestionOptions'

const API_BASE = import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.DEV ? 'http://localhost:4000/api/v1' : '/api/v1')

const LEARNER_KEY = 'upps_learner_id'
function getLearnerId() {
  const id = localStorage.getItem(LEARNER_KEY)
  if (id) return id
  const generated = crypto.randomUUID()
  localStorage.setItem(LEARNER_KEY, generated)
  return generated
}

const SEPARATOR = 'zxtrvy'

function rowToQuestion(row, subjectMeta) {
  const { id, subject_id, subtopic, question_code, question_raw,
          option_a, option_b, option_c, option_d, option_e, diagram_code } = row

  const meta = subjectMeta[subject_id] ?? { label: subject_id, color: '#555' }

  let diagramCode = diagram_code || null
  if (!diagramCode) {
    const m = String(question_raw || '').match(/\[\[IMG:([^\]]+)\]\]/)
    if (m) diagramCode = m[1]
  }

  const sepIdx = String(question_raw || '').indexOf(SEPARATOR)
  const correctAnswer = sepIdx >= 0 ? question_raw.slice(0, sepIdx).trim().toLowerCase() : ''
  let questionText = sepIdx >= 0
    ? question_raw.slice(sepIdx + SEPARATOR.length).trim()
    : String(question_raw || '').trim()
  if (diagramCode) questionText = questionText.replace(/\[\[IMG:[^\]]+\]\]/, '').trim()

  const shuffled = shuffleQuestionOptions({
    correctAnswer,
    options: {
      a: option_a || '',
      b: option_b || '',
      c: option_c || '',
      d: option_d || '',
      ...(option_e ? { e: option_e } : {}),
    },
  })

  return {
    id,
    subtopic,
    questionCode: question_code,
    correctAnswer: shuffled.correctAnswer,
    questionText,
    diagramCode,
    options: shuffled.options,
    subjectLabel: meta.label,
    subjectColor: meta.color,
  }
}

/**
 * useAllQuestionsData()
 *
 * Fetches 10 random questions from the backend (questions are served
 * server-side so Supabase credentials stay hidden).
 *
 * Local bundled JSON fallback is intentionally disabled so reads
 * always come from backend/Supabase.
 *
 * Returns { questions, loading, error, fromCache }
 */
export function useAllQuestionsData() {
  const [questions, setQuestions] = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    fetch(`${API_BASE}/questions-random?count=10`, {
      headers: { 'x-learner-id': getLearnerId() },
    })
      .then(async (res) => {
        const payload = await res.json().catch(() => ({}))
        if (!res.ok) {
          const error = new Error(payload.error || `HTTP ${res.status}`)
          error.status = res.status
          throw error
        }
        return payload
      })
      .then(({ questions: rows }) => {
        if (!rows || rows.length === 0) throw new Error('no rows')
        const subjectMeta = Object.fromEntries(SUBJECTS.map((s) => [s.id, { label: s.label, color: s.color }]))
        setQuestions(rows.map((r) => rowToQuestion(r, subjectMeta)))
        setFromCache(false)
        setLoading(false)
      })
      .catch((err) => {
        if (err.status === 402) {
          setQuestions([])
          setFromCache(false)
          setError(err.message || 'Daily free question limit reached.')
          setLoading(false)
          return
        }

        console.warn('[useAllQuestionsData] API error:', err.message)
        setQuestions([])
        setFromCache(false)
        setError(err.message || 'Unable to load questions from server. Please try again.')
        setLoading(false)
      })
  }, [])

  return { questions, loading, error, fromCache }
}
