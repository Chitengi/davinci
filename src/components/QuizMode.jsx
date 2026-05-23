import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { getSubjectById } from '../utils/subjects'
import { flattenSubjectQuestions } from '../utils/parseQuestion'
import { getEnglishReadingPassageByQuestionCode } from '../utils/englishReadingPassages'
import { saveResult } from '../utils/storage'
import { useSubjectData } from '../hooks/useSubjectData'
import { reshuffleQuestion } from '../utils/reshuffleQuestion'
import QuestionCard from './QuestionCard'
import ResultScreen from './ResultScreen'
import './QuizMode.css'

function shuffleArray(items) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = arr[i]
    arr[i] = arr[j]
    arr[j] = temp
  }
  return arr
}

const MAX_QUESTIONS = 10

/**
 * Mode 2 — Select 10 Q&A Quiz
 * Flow: subject → user selects up to 10 questions → quiz → results
 */
export default function QuizMode() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const subject = getSubjectById(subjectId)
  const { data: subjectData, loading: dataLoading } = useSubjectData(subjectId)
  const recommendedSubtopic = searchParams.get('subtopic') || ''
  const shouldAutoStart = searchParams.get('autostart') === '1'

  const [stage, setStage] = useState('select') // 'select' | 'playing' | 'results'
  const [selected, setSelected] = useState(new Set())
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [answeredSet, setAnsweredSet] = useState(new Set())
  const [skippedSet, setSkippedSet] = useState(new Set())
  const [newBadges, setNewBadges] = useState([])
  const [hydratedDeepLink, setHydratedDeepLink] = useState(false)
  const [pendingAutoStart, setPendingAutoStart] = useState(false)
  const [deepLinkNotice, setDeepLinkNotice] = useState('')
  const [quizQuestions, setQuizQuestions] = useState([])

  if (!subject) {
    return <div className="quiz-error"><p>Subject not found.</p><button onClick={() => navigate('/')}>Home</button></div>
  }

  if (dataLoading) {
    return <div className="quiz-error"><p>Loading questions…</p></div>
  }

  const [displayQuestions, setDisplayQuestions] = useState([])

  useEffect(() => {
    const flattened = flattenSubjectQuestions(subjectData)
    setDisplayQuestions(shuffleArray(flattened))
  }, [subjectData])

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else if (next.size < MAX_QUESTIONS) {
        next.add(id)
      }
      return next
    })
  }

  const startQuiz = () => {
    setQuizQuestions(selectedQuestions.map((question) => reshuffleQuestion(question)))
    setCurrentIndex(0)
    setAnswers({})
    setAnsweredSet(new Set())
    setSkippedSet(new Set())
    setStage('playing')
  }

  const selectedQuestions = displayQuestions.filter((q) => selected.has(q.id))

  const formatSubtopicLabel = (value) => String(value || '').replace(/_/g, ' ').replace(/-/g, ' › ')

  useEffect(() => {
    if (hydratedDeepLink || stage !== 'select') return
    setHydratedDeepLink(true)

    if (!recommendedSubtopic) return
    setDeepLinkNotice('')

    const recommendedIds = displayQuestions
      .filter((question) => question.subtopic === recommendedSubtopic)
      .slice(0, MAX_QUESTIONS)
      .map((question) => question.id)

    if (recommendedIds.length === 0) {
      setDeepLinkNotice(`Could not load recommended practice for ${formatSubtopicLabel(recommendedSubtopic)}. Please choose questions manually.`)
      return
    }

    setSelected(new Set(recommendedIds))
    setDeepLinkNotice(`Recommended practice loaded: ${formatSubtopicLabel(recommendedSubtopic)}.`)
    if (shouldAutoStart) setPendingAutoStart(true)
  }, [displayQuestions, hydratedDeepLink, recommendedSubtopic, shouldAutoStart, stage])

  useEffect(() => {
    if (!pendingAutoStart || stage !== 'select' || selected.size === 0) return
    setPendingAutoStart(false)
    setQuizQuestions(selectedQuestions.map((question) => reshuffleQuestion(question)))
    setCurrentIndex(0)
    setAnswers({})
    setAnsweredSet(new Set())
    setSkippedSet(new Set())
    setStage('playing')
  }, [pendingAutoStart, selected, stage])

  const handleAnswer = (letter) => {
    const question = quizQuestions[currentIndex]
    setAnswers((prev) => ({ ...prev, [question.id]: letter }))
    setAnsweredSet((prev) => new Set([...prev, question.id]))
    setSkippedSet((prev) => {
      const next = new Set(prev)
      next.delete(question.id)
      return next
    })
  }

  const handleNext = (skippedOverride = null) => {
    const effectiveSkipped = skippedOverride || skippedSet
    if (currentIndex < quizQuestions.length - 1) {
      setCurrentIndex((i) => i + 1)
    } else {
      const details = quizQuestions.map((q) => ({
        question: q,
        userAnswer: answers[q.id] || null,
        skipped: effectiveSkipped.has(q.id),
        correct: answers[q.id] === q.correctAnswer,
      }))
      const score = details.filter((d) => d.correct).length
      setNewBadges(saveResult({
        mode: 'Select 10 Quiz',
        subject: subject.label,
        score,
        total: quizQuestions.length,
        details,
      }))
      setStage('results')
    }
  }

  const handleSkip = () => {
    const question = quizQuestions[currentIndex]
    const nextSkipped = new Set([...skippedSet, question.id])
    setSkippedSet(nextSkipped)
    handleNext(nextSkipped)
  }

  // Selection stage
  if (stage === 'select') {
    // Group by subtopic for display
    const bySubtopic = {}
    displayQuestions.forEach((q) => {
      if (!bySubtopic[q.subtopic]) bySubtopic[q.subtopic] = []
      bySubtopic[q.subtopic].push(q)
    })

    return (
      <div className="quiz-container">
        <header className="quiz-header">
          <h2 className="quiz-title">{subject.label}</h2>
          <p className="quiz-subtitle">Select up to {MAX_QUESTIONS} questions</p>
        </header>

        <div className="quiz-select-info">
          <span className="quiz-selected-count">{selected.size} / {MAX_QUESTIONS} selected</span>
          <button
            className="quiz-start-btn"
            disabled={selected.size === 0}
            onClick={startQuiz}
          >
            Start Quiz →
          </button>
        </div>

        {deepLinkNotice && (
          <p className="quiz-deeplink-note">{deepLinkNotice}</p>
        )}

        <div className="quiz-question-list">
          {Object.entries(bySubtopic).map(([subtopic, questions]) => (
            <div key={subtopic} className="quiz-subtopic-group">
              <h3 className="quiz-subtopic-heading">
                {subtopic.replace(/_/g, ' ').replace(/-/g, ' › ')}
              </h3>
              {questions.map((q) => (
                <button
                  key={q.id}
                  className={`quiz-question-row ${selected.has(q.id) ? 'quiz-question-row--selected' : ''} ${selected.size >= MAX_QUESTIONS && !selected.has(q.id) ? 'quiz-question-row--disabled' : ''}`}
                  style={{ '--subj-color': subject.color }}
                  onClick={() => toggleSelect(q.id)}
                  aria-pressed={selected.has(q.id)}
                >
                  <span className="quiz-question-check">{selected.has(q.id) ? '✅' : '⬜'}</span>
                  <span className="quiz-question-preview">{q.questionText.slice(0, 80)}{q.questionText.length > 80 ? '…' : ''}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (stage === 'results') {
    const details = quizQuestions.map((q) => ({
      question: q,
      userAnswer: answers[q.id] || null,
      skipped: skippedSet.has(q.id),
      correct: answers[q.id] === q.correctAnswer,
    }))
    const score = details.filter((d) => d.correct).length

    return (
      <div className="quiz-page">
        <div className="quiz-results-back">
          <button onClick={() => { setStage('select'); setSelected(new Set()) }} className="quiz-back-btn">← Back to Selection</button>
        </div>
        <ResultScreen
          score={score}
          total={quizQuestions.length}
          mode="quiz"
          subjectLabel={subject.label}
          details={details}
          onRestart={() => { setStage('select'); setSelected(new Set()); setQuizQuestions([]) }}
          newBadges={newBadges}
        />
      </div>
    )
  }

  // Playing
  const question = quizQuestions[currentIndex]
  const isAnswered = answeredSet.has(question.id)
  const isLast = currentIndex === quizQuestions.length - 1
  const isSkipped = skippedSet.has(question.id)
  const readingPassage = subject.id === 'english'
    ? getEnglishReadingPassageByQuestionCode(question.questionCode)
    : null

  return (
    <div className="quiz-page">
      <header className="quiz-header" style={{ '--subj-color': subject.color }}>
        <button className="quiz-back" onClick={() => setStage('select')}>← Back</button>
        <div className="quiz-header-info">
          <span className="quiz-subject-name">{subject.label}</span>
          <span className="quiz-mode-name">Select 10 Quiz</span>
        </div>
      </header>
      <div className="quiz-content">
        <QuestionCard
          question={question}
          questionNumber={currentIndex + 1}
          totalQuestions={quizQuestions.length}
          onAnswer={handleAnswer}
          showFeedback={true}
          passage={readingPassage}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {!isAnswered && !isSkipped && (
            <button className="quiz-next-btn quiz-skip-btn" onClick={handleSkip} type="button">
              {isLast ? 'Skip and Finish' : 'Skip Question'}
            </button>
          )}
          {(isAnswered || isSkipped) && (
            <button className="quiz-next-btn" onClick={() => handleNext()} type="button">
              {isLast ? 'Finish Quiz' : 'Next →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
