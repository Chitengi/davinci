import { useState, useEffect, useRef } from 'react'
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

/**
 * useSubjectData(subjectId)
 *
 * Fetches questions for a subject from the Express backend (which holds
 * the Supabase service key server-side). Rebuilds the same nested JSON
 * shape that parseQuestion / getSubtopics / flattenSubjectQuestions expect.
 *
 * Local bundled JSON fallback is intentionally disabled so reads
 * always come from backend/Supabase.
 *
 * Returns { data, loading, error, fromCache }
 */
export function useSubjectData(subjectId) {
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!subjectId) {
      setData(null)
      setFromCache(false)
      setLoading(false)
      return
    }

    if (fetchedRef.current) return
    fetchedRef.current = true

    setLoading(true)

    fetch(`${API_BASE}/questions/${encodeURIComponent(subjectId)}`, {
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
        setData(buildSubjectShape(subjectId, rows))
        setFromCache(false)
        setLoading(false)
      })
      .catch((err) => {
        if (err.status === 402) {
          setFromCache(false)
          setData(buildSubjectShape(subjectId, []))
          setError(err.message || 'Daily free question limit reached.')
          setLoading(false)
          return
        }

        console.warn(`[useSubjectData] API error for ${subjectId}:`, err.message)
        setData(null)
        setFromCache(false)
        setError(err.message || 'Unable to load questions from server. Please try again.')
        setLoading(false)
      })
  }, [subjectId])

  return { data, loading, error, fromCache }
}

/**
 * Converts a flat array of DB rows back into the nested JSON shape
 * the existing parseQuestion / getSubtopics / flattenSubjectQuestions utilities expect.
 */
function buildSubjectShape(subjectId, rows) {
  const topKey = '_' + subjectId.toUpperCase()
  const subtopicsMap = {}

  for (const row of rows) {
    const { subtopic, question_code, question_raw, option_a, option_b, option_c, option_d, option_e, diagram_code } = row
    if (!subtopicsMap[subtopic]) subtopicsMap[subtopic] = {}

    const sepIndex = String(question_raw || '').indexOf('zxtrvy')
    const questionText = sepIndex >= 0
      ? String(question_raw || '').slice(sepIndex + 'zxtrvy'.length).trim()
      : String(question_raw || '').trim()

    const shuffled = shuffleQuestionOptions({
      correctAnswer: String(question_raw || '').split('zxtrvy')[0],
      options: {
        a: option_a || '',
        b: option_b || '',
        c: option_c || '',
        d: option_d || '',
        ...(option_e ? { e: option_e } : {}),
      },
    })

    subtopicsMap[subtopic][question_code] = {
      Question: `${shuffled.correctAnswer}zxtrvy${questionText}`,
      a: shuffled.options.a || '',
      b: shuffled.options.b || '',
      c: shuffled.options.c || '',
      d: shuffled.options.d || '',
      ...(shuffled.options.e ? { e: shuffled.options.e } : {}),
      ...(diagram_code ? { diagram: diagram_code } : {}),
    }
  }

  return { [topKey]: subtopicsMap }
}
