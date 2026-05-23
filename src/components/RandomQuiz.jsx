import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getEnglishReadingPassageByQuestionCode } from '../utils/englishReadingPassages'
import { saveResult } from '../utils/storage'
import { useAllQuestionsData } from '../hooks/useAllQuestionsData'
import { reshuffleQuestion } from '../utils/reshuffleQuestion'
import QuestionCard from './QuestionCard'
import ResultScreen from './ResultScreen'
import './RandomQuiz.css'

const QUESTION_COUNT = 10

/**
 * Mode 3 — 10 Random Q&A
 * Randomly picks 10 questions from ALL subjects.
 */
export default function RandomQuiz() {
  const navigate = useNavigate()
  const { questions: allQuestions, loading: dataLoading, error: dataError } = useAllQuestionsData()

  const pickRandom = (pool) => {
    const shuffled = [...pool].sort(() => Math.random() - 0.5)
    return shuffled.slice(0, QUESTION_COUNT)
  }

  const [questions, setQuestions] = useState(null) // null = not yet picked
  const [stage, setStage] = useState('playing') // 'playing' | 'results'
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [answeredSet, setAnsweredSet] = useState(new Set())
  const [skippedSet, setSkippedSet] = useState(new Set())
  const [newBadges, setNewBadges] = useState([])

  // Once data loads, pick the random set once
  if (!dataLoading && questions === null) {
    setQuestions(pickRandom(allQuestions))
  }

  if (dataLoading || questions === null) {
    return <div className="random-page"><p style={{ textAlign: 'center', padding: '2rem' }}>Loading questions…</p></div>
  }

  if (!questions.length) {
    return (
      <div className="random-page">
        <p style={{ textAlign: 'center', padding: '2rem' }}>
          {dataError || 'No questions available right now. Please try again later.'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem' }}>
          <button className="random-back" onClick={() => navigate('/paywall')}>View Plans</button>
          <button className="random-back" onClick={() => navigate('/')}>Home</button>
        </div>
      </div>
    )
  }

  const handleAnswer = (letter) => {
    const question = questions[currentIndex]
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
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1)
    } else {
      const details = questions.map((q) => ({
        question: q,
        userAnswer: answers[q.id] || null,
        skipped: effectiveSkipped.has(q.id),
        correct: answers[q.id] === q.correctAnswer,
      }))
      const score = details.filter((d) => d.correct).length
      setNewBadges(saveResult({
        mode: '10 Random Q&A',
        subject: 'All Subjects',
        score,
        total: questions.length,
        details,
      }))
      setStage('results')
    }
  }

  const handleSkip = () => {
    const question = questions[currentIndex]
    const nextSkipped = new Set([...skippedSet, question.id])
    setSkippedSet(nextSkipped)
    handleNext(nextSkipped)
  }

  const handleRestart = () => {
    const fresh = pickRandom(allQuestions).map((question) => reshuffleQuestion(question))
    setQuestions(fresh)
    setCurrentIndex(0)
    setAnswers({})
    setAnsweredSet(new Set())
    setSkippedSet(new Set())
    setStage('playing')
  }

  if (stage === 'results') {
    const details = questions.map((q) => ({
      question: q,
      userAnswer: answers[q.id] || null,
      skipped: skippedSet.has(q.id),
      correct: answers[q.id] === q.correctAnswer,
    }))
    const score = details.filter((d) => d.correct).length

    return (
      <div className="random-page">
        <div className="random-results-back">
          <button className="random-back-btn" onClick={() => navigate('/')}>← Home</button>
        </div>
        <ResultScreen
          score={score}
          total={questions.length}
          mode="random"
          subjectLabel="All Subjects — Random"
          details={details}
          onRestart={handleRestart}
          newBadges={newBadges}
        />
      </div>
    )
  }

  const question = questions[currentIndex]
  const isAnswered = answeredSet.has(question.id)
  const isLast = currentIndex === questions.length - 1
  const isSkipped = skippedSet.has(question.id)
  const readingPassage = question.subjectLabel === 'English'
    ? getEnglishReadingPassageByQuestionCode(question.questionCode)
    : null

  return (
    <div className="random-page">
      <header className="random-header">
        <button className="random-back" onClick={() => navigate('/')}>← Home</button>
        <span className="random-emoji">🎲</span>
        <h2 className="random-title">10 Random Q&amp;A</h2>
        <p className="random-subtitle">Questions from all subjects</p>
        <div className="random-subject-tag" style={{ background: question.subjectColor }}>
          {question.subjectLabel}
        </div>
      </header>

      <div className="random-content">
        <QuestionCard
          question={question}
          questionNumber={currentIndex + 1}
          totalQuestions={questions.length}
          onAnswer={handleAnswer}
          showFeedback={true}
          passage={readingPassage}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {!isAnswered && !isSkipped && (
            <button className="random-next-btn random-skip-btn" onClick={handleSkip} type="button">
              {isLast ? 'Skip and Finish' : 'Skip Question'}
            </button>
          )}
          {(isAnswered || isSkipped) && (
            <button className="random-next-btn" onClick={() => handleNext()} type="button">
              {isLast ? 'See Results' : 'Next →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
