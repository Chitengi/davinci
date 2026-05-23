import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { loadPerformance, clearPerformance, getLearnerRecommendations } from '../utils/storage'
import { BADGE_DEFINITIONS, computeEarnedBadgeIds } from '../utils/badges'
import { SUBJECTS } from '../utils/subjects'
import './Performance.css'

/**
 * Mode 5 — Performance / History
 */
export default function Performance() {
  const navigate = useNavigate()
  const [history, setHistory] = useState(() => loadPerformance())
  const [showConfirm, setShowConfirm] = useState(false)
  const logoSrc = `${import.meta.env.BASE_URL}diagrams/bullet.png`
  const earnedBadgeIds = computeEarnedBadgeIds(history)
  const recommendations = getLearnerRecommendations(history, 6)

  const getSubjectIdByLabel = (label) => {
    const normalized = String(label || '').trim().toLowerCase()
    const match = SUBJECTS.find((subject) => subject.label.trim().toLowerCase() === normalized)
    return match?.id || null
  }

  const startRecommendedPractice = (row) => {
    const subjectId = getSubjectIdByLabel(row.subject)
    if (!subjectId) return

    const params = new URLSearchParams({
      subtopic: row.subtopicKey || row.subtopic,
      autostart: '1',
    })
    navigate(`/quiz/${subjectId}?${params.toString()}`)
  }

  const handleClear = () => {
    clearPerformance()
    setHistory([])
    setShowConfirm(false)
  }

  const averagePercent = history.length > 0
    ? Math.round(history.reduce((sum, r) => sum + (r.total > 0 ? (r.score / r.total) * 100 : 0), 0) / history.length)
    : null

  const formatDate = (isoString) => {
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
    } catch {
      return isoString || ''
    }
  }

  const getScoreColor = (score, total) => {
    const pct = total > 0 ? (score / total) * 100 : 0
    if (pct >= 80) return '#2E7D32'
    if (pct >= 60) return '#F57F17'
    if (pct >= 40) return '#E65100'
    return '#C62828'
  }

  return (
    <div className="perf-page">
      <header className="perf-header">
        <button className="perf-back" onClick={() => navigate('/')}>← Home</button>
        <img className="perf-logo-img" src={logoSrc} alt="Performance tracking" />
        <h2 className="perf-title">MY PERFORMANCE</h2>
        <p className="perf-subtitle">{history.length} session{history.length !== 1 ? 's' : ''} recorded</p>
      </header>

      {history.length > 0 && (
        <div className="perf-summary">
          <div className="perf-summary-card">
            <div className="perf-summary-value">{history.length}</div>
            <div className="perf-summary-label">Sessions</div>
          </div>
          <div className="perf-summary-card">
            <div className="perf-summary-value" style={{ color: getScoreColor(averagePercent, 100) }}>
              {averagePercent}%
            </div>
            <div className="perf-summary-label">Average Score</div>
          </div>
          <div className="perf-summary-card">
            <div className="perf-summary-value">
              {history.reduce((sum, r) => sum + (r.score || 0), 0)}
            </div>
            <div className="perf-summary-label">Total Correct</div>
          </div>
        </div>
      )}

      {/* Badges showcase */}
      <div className="perf-badges-section">
        <h3 className="perf-badges-title">🏅 My Badges</h3>
        <div className="perf-badges-grid">
          {BADGE_DEFINITIONS.map((badge) => {
            const earned = earnedBadgeIds.has(badge.id)
            return (
              <div key={badge.id} className={`perf-badge-card${earned ? ' perf-badge-card--earned' : ''}`}>
                <span className="perf-badge-icon">{badge.icon}</span>
                <span className="perf-badge-name">{badge.name}</span>
                <span className="perf-badge-desc">
                  {badge.description}
                  {earned && <span aria-label="Earned badge" title="Earned" style={{ color: '#1b8a3d', marginLeft: 6, fontWeight: 900 }}>✓</span>}
                </span>
                {!earned && <span className="perf-badge-lock">🔒</span>}
              </div>
            )
          })}
        </div>
      </div>

      {recommendations.length > 0 && (
        <div className="perf-badges-section" style={{ marginTop: 14 }}>
          <h3 className="perf-badges-title">🧭 Recommended Focus Areas</h3>
          <div className="perf-badges-grid">
            {recommendations.map((row) => (
              <div key={`${row.subject}-${row.subtopic}`} className="perf-badge-card perf-badge-card--earned">
                <span className="perf-badge-icon">🎯</span>
                <span className="perf-badge-name">{row.subject}</span>
                <span className="perf-badge-desc" style={{ fontWeight: 700 }}>{row.subtopic}</span>
                <span className="perf-badge-desc">{row.reason}</span>
                <span className="perf-badge-desc">Also missed: {row.wrongCount} question{row.wrongCount === 1 ? '' : 's'}</span>
                <button
                  type="button"
                  className="perf-start-btn"
                  style={{ marginTop: 8, padding: '0.5rem 0.75rem', fontSize: '0.78rem', borderRadius: 10 }}
                  onClick={() => startRecommendedPractice(row)}
                >
                  Start Recommended Practice
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length === 0 ? (
        <div className="perf-empty">
          <div className="perf-empty-icon">📚</div>
          <p>No sessions recorded yet.</p>
          <p className="perf-empty-sub">Complete a quiz or test paper to see your results here.</p>
          <button className="perf-start-btn" onClick={() => navigate('/')}>Start Practising</button>
        </div>
      ) : (
        <div className="perf-list">
          {history.map((session) => {
            const pct = session.total > 0 ? Math.round((session.score / session.total) * 100) : 0
            const color = getScoreColor(session.score, session.total)
            return (
              <div key={session.id} className="perf-session-card">
                <div className="perf-session-left">
                  <div className="perf-session-mode">{session.mode}</div>
                  <div className="perf-session-subject">{session.subject}</div>
                  {session.subtopic && (
                    <div className="perf-session-subtopic">{session.subtopic}</div>
                  )}
                  <div className="perf-session-date">{formatDate(session.date)}</div>
                </div>
                <div className="perf-session-right">
                  <div className="perf-session-score" style={{ color }}>
                    {session.score}/{session.total}
                  </div>
                  <div className="perf-session-percent" style={{ color }}>
                    {pct}%
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {history.length > 0 && (
        <div className="perf-clear-area">
          {!showConfirm ? (
            <button className="perf-clear-btn" onClick={() => setShowConfirm(true)}>
              Clear History
            </button>
          ) : (
            <div className="perf-confirm">
              <p>Are you sure? This cannot be undone.</p>
              <div className="perf-confirm-btns">
                <button className="perf-confirm-yes" onClick={handleClear}>Yes, Clear</button>
                <button className="perf-confirm-no" onClick={() => setShowConfirm(false)}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
