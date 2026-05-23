import { useNavigate } from 'react-router-dom'
import './ResultScreen.css'

/**
 * ResultScreen — shown after completing a quiz/test.
 *
 * Props:
 *  score        — number correct
 *  total        — total questions
 *  mode         — 'test' | 'quiz' | 'random'
 *  subjectLabel — name of subject (may be null for random mode)
 *  details      — array of { question, userAnswer, correct: bool }
 *  onRestart()  — called to try again
 *  onHome()     — called to go back to home
 */
export default function ResultScreen({ score, total, mode, subjectLabel, details = [], onRestart, onHome, newBadges = [] }) {
  const percent = total > 0 ? Math.round((score / total) * 100) : 0
  const navigate = useNavigate()

  const getGrade = () => {
    if (percent >= 80) return { label: 'Excellent! 🎉', color: '#2E7D32' }
    if (percent >= 60) return { label: 'Good Work! 👍', color: '#F57F17' }
    if (percent >= 40) return { label: 'Keep Trying! 💪', color: '#E65100' }
    return { label: 'Needs More Practice 📚', color: '#C62828' }
  }

  const grade = getGrade()

  return (
    <div className="result-screen">
      <div className="result-card">
        <h2 className="result-title">Results</h2>
        {subjectLabel && <p className="result-subject">{subjectLabel}</p>}

        <div className="result-score-circle" style={{ '--percent': percent, '--color': grade.color }}>
          <span className="result-score-number">{score}</span>
          <span className="result-score-divider">/ {total}</span>
        </div>

        <p className="result-percent" style={{ color: grade.color }}>
          {percent}%
        </p>
        <p className="result-grade" style={{ color: grade.color }}>
          {grade.label}
        </p>

        <div className="result-actions">
          <button className="result-btn result-btn--primary" onClick={onRestart}>
            Try Again
          </button>
          <button className="result-btn result-btn--secondary" onClick={() => navigate('/')}>
            Home
          </button>
        </div>

        {newBadges.length > 0 && (
          <div className="result-new-badges">
            <div className="result-badges-heading">🏅 Badge{newBadges.length > 1 ? 's' : ''} Earned!</div>
            <div className="result-badges-list">
              {newBadges.map((badge) => (
                <div key={badge.id} className="result-badge-item">
                  <span className="result-badge-icon">{badge.icon}</span>
                  <div className="result-badge-info">
                    <span className="result-badge-name">{badge.name}</span>
                    <span className="result-badge-desc">
                      {badge.description}
                      <span aria-label="Earned badge" title="Earned" style={{ color: '#1b8a3d', marginLeft: 6, fontWeight: 900 }}>✓</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {details.length > 0 && (
        <div className="result-review">
          <h3 className="result-review-title">Review Answers</h3>
          {details.map((item, i) => (
            <div
              key={item.question?.id || i}
              className={`result-review-item ${item.correct ? 'result-review-item--correct' : 'result-review-item--wrong'}`}
            >
              <div className="result-review-header">
                <span className="result-review-num">Q{i + 1}</span>
                <span className="result-review-verdict">{item.correct ? '✅' : '❌'}</span>
              </div>
              <p className="result-review-question">{item.question?.questionText}</p>
              <div className="result-review-answers">
                <span className={`result-review-answer ${item.correct ? 'correct' : 'wrong'}`}>
                  Your answer: {item.userAnswer?.toUpperCase() || '—'}
                  {item.userAnswer ? ` — ${item.question?.options?.[item.userAnswer] || ''}` : ''}
                </span>
                {!item.correct && (
                  <span className="result-review-answer correct">
                    Correct: {item.question?.correctAnswer?.toUpperCase()}
                    {' — '}{item.question?.options?.[item.question?.correctAnswer] || ''}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
