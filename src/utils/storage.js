import { computeEarnedBadgeIds, BADGE_DEFINITIONS } from './badges'

const PERFORMANCE_KEY = 'upps_performance'
const SEEN_BADGES_KEY = 'upps_seen_badges'

/**
 * Loads the set of badge ids that have already been shown to the user.
 */
export const loadSeenBadgeIds = () => {
  try {
    const raw = localStorage.getItem(SEEN_BADGES_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

/**
 * Marks the given badge ids as seen (notification has been shown).
 */
export const markBadgesSeen = (ids) => {
  try {
    const existing = loadSeenBadgeIds()
    ids.forEach((id) => existing.add(id))
    localStorage.setItem(SEEN_BADGES_KEY, JSON.stringify([...existing]))
  } catch {
    // ignore
  }
}

/**
 * Loads the performance history from localStorage.
 * Returns an array of session result objects.
 */
export const loadPerformance = () => {
  try {
    const raw = localStorage.getItem(PERFORMANCE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * Saves a quiz/test session result to localStorage.
 * Returns an array of newly earned badge objects (empty if none).
 * @param {object} result
 *   { mode, subject, subtopic, score, total, date, details }
 */
export const saveResult = (result) => {
  try {
    const existing = loadPerformance()
    const earnedBefore = computeEarnedBadgeIds(existing)

    const updated = [
      {
        ...result,
        date: result.date || new Date().toISOString(),
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      },
      ...existing,
    ].slice(0, 200) // keep last 200 sessions
    localStorage.setItem(PERFORMANCE_KEY, JSON.stringify(updated))

    const earnedAfter = computeEarnedBadgeIds(updated)
    const seenIds = loadSeenBadgeIds()

    const newBadges = BADGE_DEFINITIONS.filter(
      (b) => earnedAfter.has(b.id) && !earnedBefore.has(b.id) && !seenIds.has(b.id),
    )
    if (newBadges.length > 0) markBadgesSeen(newBadges.map((b) => b.id))
    return newBadges
  } catch {
    return []
  }
}

/**
 * Clears all stored performance history.
 */
export const clearPerformance = () => {
  try {
    localStorage.removeItem(PERFORMANCE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Builds learner recommendations from historical session details.
 * Skipped questions are weighted more heavily than wrong answers.
 */
export const getLearnerRecommendations = (history = null, limit = 5) => {
  const sessions = Array.isArray(history) ? history : loadPerformance()
  const byTopic = new Map()

  sessions.forEach((session) => {
    const details = Array.isArray(session?.details) ? session.details : []
    details.forEach((entry) => {
      const question = entry?.question || {}
      const skipped = Boolean(entry?.skipped)
      const wrong = !skipped && entry?.userAnswer !== null && entry?.userAnswer !== undefined && !entry?.correct
      if (!skipped && !wrong) return

      const subject = String(session?.subject || question?.subjectLabel || 'General').trim()
      const rawSubtopic = String(question?.subtopic || session?.subtopic || 'General').trim()
      const subtopic = rawSubtopic.replace(/_/g, ' ').replace(/-/g, ' -> ')
      const key = `${subject}::${rawSubtopic}`

      const current = byTopic.get(key) || {
        key,
        subject,
        subtopic,
        skippedCount: 0,
        wrongCount: 0,
        questionIds: new Set(),
      }

      if (skipped) current.skippedCount += 1
      if (wrong) current.wrongCount += 1
      if (question?.id) current.questionIds.add(String(question.id))

      byTopic.set(key, current)
    })
  })

  return [...byTopic.values()]
    .map((row) => {
      const weightedScore = (row.skippedCount * 3) + row.wrongCount
      const reason = row.skippedCount > 0
        ? `Skipped ${row.skippedCount} question${row.skippedCount === 1 ? '' : 's'} here`
        : `Missed ${row.wrongCount} question${row.wrongCount === 1 ? '' : 's'} here`
      return {
        subject: row.subject,
        subtopic: row.subtopic,
        subtopicKey: row.key.split('::')[1] || row.subtopic,
        skippedCount: row.skippedCount,
        wrongCount: row.wrongCount,
        weightedScore,
        reason,
        questionCount: row.questionIds.size,
      }
    })
    .sort((a, b) => {
      if (b.weightedScore !== a.weightedScore) return b.weightedScore - a.weightedScore
      if (b.skippedCount !== a.skippedCount) return b.skippedCount - a.skippedCount
      return String(a.subtopic).localeCompare(String(b.subtopic), undefined, { sensitivity: 'base' })
    })
    .slice(0, Math.max(1, Number(limit) || 5))
}
