import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSubjectById } from '../utils/subjects'
import { flattenSubjectQuestions } from '../utils/parseQuestion'
import { useSubjectData } from '../hooks/useSubjectData'
import { useSpeech } from '../hooks/useSpeech'
import './Flashcards.css'

/**
 * Mode 4 — Flashcards
 * Shows question on front, tap to flip and reveal correct answer.
 */
export default function Flashcards() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const subject = getSubjectById(subjectId)
  const { data: subjectData, loading: dataLoading } = useSubjectData(subjectId)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [showOptions, setShowOptions] = useState(false)
  const [selectedOption, setSelectedOption] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [known, setKnown] = useState(new Set())
  const [stillLearning, setStillLearning] = useState(new Set())
  const [showHint, setShowHint] = useState(false)
  const { speaking, speak, stop, supported: speechSupported } = useSpeech()

  if (!subject) {
    return <div className="fc-error"><p>Subject not found.</p><button onClick={() => navigate('/')}>Home</button></div>
  }

  if (dataLoading) {
    return <div className="fc-error"><p>Loading questions…</p></div>
  }

  const questions = flattenSubjectQuestions(subjectData)

  if (questions.length === 0) {
    return (
      <div className="fc-page">
        <div className="fc-empty">No questions available for this subject.</div>
      </div>
    )
  }

  const question = questions[currentIndex]
  const totalKnown = known.size
  const optionEntries = Object.entries(question.options || {}).filter(([letter]) => letter !== 'e')
  const hintText = String(question?.options?.e || '').trim()
  const hasHint = hintText.length > 0

  const resetCardProgress = () => {
    setShowOptions(false)
    setSelectedOption(null)
    setConfirmed(false)
    setShowHint(false)
    stop()
  }

  const handleKnow = () => {
    setKnown((prev) => new Set([...prev, question.id]))
    setStillLearning((prev) => {
      const next = new Set(prev)
      next.delete(question.id)
      return next
    })
    advance()
  }

  const handleLearn = () => {
    setStillLearning((prev) => new Set([...prev, question.id]))
    setKnown((prev) => {
      const next = new Set(prev)
      next.delete(question.id)
      return next
    })
    advance()
  }

  const advance = () => {
    resetCardProgress()
    setCurrentIndex((i) => (i + 1) % questions.length)
  }

  const handlePrev = () => {
    resetCardProgress()
    setCurrentIndex((i) => (i - 1 + questions.length) % questions.length)
  }

  const handleNext = () => {
    resetCardProgress()
    setCurrentIndex((i) => (i + 1) % questions.length)
  }

  const handleSelectOption = (letter) => {
    if (confirmed) return
    setSelectedOption(letter)
  }

  const handleConfirmSelection = () => {
    if (!selectedOption) return
    setConfirmed(true)
  }

  const isCorrect = selectedOption === question.correctAnswer

  return (
    <div className="fc-page">
      <header className="fc-header" style={{ '--subj-color': subject.color }}>
        <button className="fc-back" onClick={() => navigate('/subject-picker/flashcards')}>← Back</button>
        <span className="fc-emoji">{subject.emoji}</span>
        <h2 className="fc-title">{subject.label}</h2>
        <p className="fc-subtitle">Flashcards</p>
      </header>

      <div className="fc-progress-bar">
        <div className="fc-progress-info">
          <span>{currentIndex + 1} / {questions.length}</span>
          <span className="fc-known-count">✅ {totalKnown} known</span>
        </div>
        <div className="fc-bar-track">
          <div
            className="fc-bar-fill"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%`, background: subject.color }}
          />
        </div>
      </div>

      <div className="fc-card-area">
        <div
          className="fc-card"
          style={{ '--subj-color': subject.color, '--subj-bg': subject.bgColor }}
        >
          <div className="fc-card-face">
            <div className="fc-card-label">Question</div>
            <div className="fc-question-row">
              <p className="fc-card-text">{question.questionText}</p>
              {speechSupported && (
                <button
                  type="button"
                  className={`fc-speak-btn${speaking ? ' fc-speak-btn--active' : ''}`}
                  onClick={() => speak(question.questionText)}
                  aria-label={speaking ? 'Stop reading' : 'Read question aloud'}
                  title={speaking ? 'Stop' : 'Read aloud'}
                >
                  {speaking ? '⏹' : '🔊'}
                </button>
              )}
            </div>

            {!showOptions && (
              <button className="fc-show-options-btn" onClick={() => setShowOptions(true)}>
                Show Multiple Choice Answers
              </button>
            )}

            {showOptions && (
              <div className="fc-quiz-area">
                {hasHint && (
                  <div className="fc-hint-wrap">
                    <button
                      type="button"
                      className="fc-hint-btn"
                      onClick={() => setShowHint((prev) => !prev)}
                    >
                      {showHint ? 'Hide Hint' : 'Show Hint'}
                    </button>
                    {showHint && <div className="fc-hint-box">Hint: {hintText}</div>}
                  </div>
                )}

                <div className="fc-card-all-options">
                  {optionEntries.map(([letter, text]) => {
                    const isSelected = selectedOption === letter
                    const isAnswer = letter === question.correctAnswer
                    const rowClass = [
                      'fc-option-row',
                      isSelected ? 'fc-option-row--selected' : '',
                      confirmed && isAnswer ? 'fc-option-row--correct' : '',
                      confirmed && isSelected && !isCorrect ? 'fc-option-row--wrong' : '',
                    ].filter(Boolean).join(' ')

                    return (
                      <button
                        key={letter}
                        className={rowClass}
                        onClick={() => handleSelectOption(letter)}
                        disabled={confirmed}
                      >
                        <span className="fc-option-letter">{letter.toUpperCase()}</span>
                        <span>{text}</span>
                      </button>
                    )
                  })}
                </div>

                {!confirmed && (
                  <button
                    className="fc-confirm-btn"
                    onClick={handleConfirmSelection}
                    disabled={!selectedOption}
                  >
                    Confirm Answer
                  </button>
                )}

                {confirmed && (
                  <div className={`fc-feedback ${isCorrect ? 'fc-feedback--correct' : 'fc-feedback--wrong'}`}>
                    {isCorrect
                      ? 'Correct. Well done!'
                      : `Not quite. Correct answer is ${question.correctAnswer.toUpperCase()}: ${question.options[question.correctAnswer]}`}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {confirmed && (
          <div className="fc-actions">
            <button className="fc-btn fc-btn--learn" onClick={handleLearn}>Still Learning 📚</button>
            <button className="fc-btn fc-btn--know" onClick={handleKnow}>I Know This ✅</button>
          </div>
        )}

        <div className="fc-nav">
          <button className="fc-nav-btn" onClick={handlePrev}>← Prev</button>
          <button className="fc-nav-btn" onClick={handleNext}>Next →</button>
        </div>
      </div>
    </div>
  )
}
