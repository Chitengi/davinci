import { useState, useEffect, useMemo } from 'react'
import { useSpeech } from '../hooks/useSpeech'
import './QuestionCard.css'

const OPTION_LETTERS = ['a', 'b', 'c', 'd']

/**
 * QuestionCard — renders one question with options.
 *
 * Props:
 *  question       — { questionText, options, correctAnswer, diagramCode, questionCode }
 *  questionNumber — 1-based number to display
 *  totalQuestions — total in the set
 *  onAnswer(letter) — called when user confirms an answer
 *  showFeedback   — if true, immediately show correct/wrong highlight after answer
 *  readOnly       — if true, shows the question + correct answer highlighted (review mode)
 *  userAnswer     — pre-selected answer letter (for readOnly / review)
 *  passage        — optional { passageNumber, title, text } shown above the question
 *  imagesBase     — base path for diagram images (default '/diagrams/')
 */
export default function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  onAnswer,
  showFeedback = true,
  readOnly = false,
  userAnswer = null,
  passage = null,
  imagesBase = `${import.meta.env.BASE_URL}diagrams/`,
}) {
  const [selected, setSelected] = useState(userAnswer || null)
  const [confirmed, setConfirmed] = useState(readOnly)
  const [diagramIndex, setDiagramIndex] = useState(0)
  const [zoomOpen, setZoomOpen] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [showHint, setShowHint] = useState(false)
  const { speaking, speak, stop, supported: speechSupported } = useSpeech()

  // Reset when question changes
  useEffect(() => {
    setSelected(userAnswer || null)
    setConfirmed(readOnly)
    setDiagramIndex(0)
    setZoomOpen(false)
    setZoomLevel(1)
    setShowHint(false)
    stop()
  }, [question?.id, readOnly, userAnswer])

  useEffect(() => {
    if (!zoomOpen) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setZoomOpen(false)
      if (event.key === '+') setZoomLevel((z) => Math.min(4, Number((z + 0.25).toFixed(2))))
      if (event.key === '-') setZoomLevel((z) => Math.max(1, Number((z - 0.25).toFixed(2))))
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [zoomOpen])

  const handleSelect = (letter) => {
    if (confirmed) return
    setSelected(letter)
  }

  const handleConfirm = () => {
    if (!selected || confirmed) return
    setConfirmed(true)
    if (onAnswer) onAnswer(selected)
  }

  const getOptionClass = (letter) => {
    const base = 'qcard-option'
    if (!confirmed && !readOnly) {
      return selected === letter ? `${base} qcard-option--selected` : base
    }
    // After confirmation / readOnly
    if (letter === question.correctAnswer) return `${base} qcard-option--correct`
    if (letter === selected && letter !== question.correctAnswer) return `${base} qcard-option--wrong`
    return `${base} qcard-option--dim`
  }

  const availableOptions = OPTION_LETTERS.filter(
    (l) => question.options && question.options[l] !== undefined && question.options[l] !== '',
  )
  const hintText = String(question?.options?.e || '').trim()
  const hasHint = hintText.length > 0

  const buildDiagramCandidates = (code) => {
    const raw = String(code || '').trim()
    if (!raw) return []

    const normalizedName = raw.split(/[\\/]/).pop() || raw
    const hasExtension = /\.(png|jpg|jpeg|webp|gif)$/i.test(normalizedName)
    const baseName = hasExtension ? normalizedName.replace(/\.(png|jpg|jpeg|webp|gif)$/i, '') : normalizedName

    const nameVariants = [
      baseName,
      baseName.toLowerCase(),
      baseName.toUpperCase(),
      baseName.replace(/-/g, '_'),
      baseName.replace(/_/g, '-'),
      baseName.toLowerCase().replace(/-/g, '_'),
      baseName.toLowerCase().replace(/_/g, '-'),
      baseName.toUpperCase().replace(/-/g, '_'),
    ]

    const extVariants = hasExtension
      ? ['']
      : ['.png', '.PNG', '.jpg', '.JPG', '.jpeg', '.JPEG', '.webp', '.WEBP']

    const unique = []
    const seen = new Set()
    nameVariants.forEach((name) => {
      extVariants.forEach((ext) => {
        const src = `${imagesBase}${name}${ext}`
        if (!seen.has(src)) {
          seen.add(src)
          unique.push(src)
        }
      })
    })

    return unique
  }

  const diagramCandidates = useMemo(
    () => buildDiagramCandidates(question?.diagramCode),
    [question?.diagramCode, imagesBase],
  )
  const diagramSrc = diagramCandidates[diagramIndex] || null
  const hasMoreDiagramCandidates = diagramIndex < diagramCandidates.length - 1

  const openZoom = () => {
    setZoomOpen(true)
    setZoomLevel(1)
  }

  const closeZoom = () => {
    setZoomOpen(false)
    setZoomLevel(1)
  }

  const zoomIn = () => setZoomLevel((z) => Math.min(4, Number((z + 0.25).toFixed(2))))
  const zoomOut = () => setZoomLevel((z) => Math.max(1, Number((z - 0.25).toFixed(2))))
  const resetZoom = () => setZoomLevel(1)

  return (
    <div className="qcard">
      <div className="qcard-header">
        {totalQuestions > 0 && (
          <span className="qcard-progress">
            Question {questionNumber} of {totalQuestions}
          </span>
        )}
        <span className="qcard-code">{question.questionCode}</span>
      </div>

      {diagramSrc && (
        <div className="qcard-diagram">
          <img
            src={diagramSrc}
            alt={`Diagram for ${question.questionCode}`}
            className="qcard-diagram-img"
            onClick={openZoom}
            onError={(e) => {
              if (hasMoreDiagramCandidates) {
                setDiagramIndex((idx) => idx + 1)
                return
              }
              e.currentTarget.style.display = 'none'
            }}
          />
          <button type="button" className="qcard-zoom-btn" onClick={openZoom}>
            Zoom Diagram
          </button>
        </div>
      )}

      {passage?.text && (
        <section className="qcard-passage" aria-label="Reading passage">
          <div className="qcard-passage-head">
            <span className="qcard-passage-kicker">Passage {passage.passageNumber || ''}</span>
            {passage.title && <h4 className="qcard-passage-title">{passage.title}</h4>}
          </div>
          <div className="qcard-passage-box">
            <p className="qcard-passage-text">{passage.text}</p>
          </div>
        </section>
      )}

      <div className="qcard-question-row">
        <p className="qcard-question">{question.questionText}</p>
        {speechSupported && (
          <button
            type="button"
            className={`qcard-speak-btn${speaking ? ' qcard-speak-btn--active' : ''}`}
            onClick={() => speak(question.questionText)}
            aria-label={speaking ? 'Stop reading' : 'Read question aloud'}
            title={speaking ? 'Stop' : 'Read aloud'}
          >
            {speaking ? '⏹' : '🔊'}
          </button>
        )}
      </div>

      <div className="qcard-options">
        {availableOptions.map((letter) => (
          <button
            key={letter}
            className={getOptionClass(letter)}
            onClick={() => handleSelect(letter)}
            disabled={confirmed && !readOnly}
            aria-label={`Option ${letter.toUpperCase()}: ${question.options[letter]}`}
          >
            <span className="qcard-option-letter">{letter.toUpperCase()}</span>
            <span className="qcard-option-text">{question.options[letter]}</span>
          </button>
        ))}
      </div>

      {showFeedback && confirmed && !readOnly && (
        <div className={`qcard-feedback ${selected === question.correctAnswer ? 'qcard-feedback--correct' : 'qcard-feedback--wrong'}`}>
          {selected === question.correctAnswer
            ? '✅ Correct!'
            : `❌ Wrong — correct answer is ${question.correctAnswer.toUpperCase()}: ${question.options[question.correctAnswer]}`}
        </div>
      )}

      {hasHint && (
        <div className="qcard-hint-wrap">
          <button
            type="button"
            className="qcard-hint-btn"
            onClick={() => setShowHint((prev) => !prev)}
          >
            {showHint ? 'Hide Hint' : 'Show Hint'}
          </button>
          {showHint && <div className="qcard-hint-box">Hint: {hintText}</div>}
        </div>
      )}

      {!confirmed && !readOnly && (
        <button
          className="qcard-confirm-btn"
          onClick={handleConfirm}
          disabled={!selected}
        >
          Confirm Answer
        </button>
      )}

      {zoomOpen && diagramSrc && (
        <div className="qcard-zoom-overlay" onClick={closeZoom} role="presentation">
          <div className="qcard-zoom-panel" onClick={(e) => e.stopPropagation()}>
            <div className="qcard-zoom-toolbar">
              <button type="button" onClick={zoomOut} className="qcard-zoom-tool" disabled={zoomLevel <= 1}>−</button>
              <button type="button" onClick={zoomIn} className="qcard-zoom-tool" disabled={zoomLevel >= 4}>+</button>
              <button type="button" onClick={resetZoom} className="qcard-zoom-tool">Reset</button>
              <button type="button" onClick={closeZoom} className="qcard-zoom-tool qcard-zoom-tool--close">Close</button>
            </div>
            <div className="qcard-zoom-canvas">
              <img
                src={diagramSrc}
                alt={`Zoomed diagram for ${question.questionCode}`}
                className="qcard-zoom-img"
                style={{ transform: `scale(${zoomLevel})` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
