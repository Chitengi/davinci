import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { getSubjectById } from '../utils/subjects'
import { getSubtopics } from '../utils/parseQuestion'
import { getEnglishReadingPassageByQuestionCode } from '../utils/englishReadingPassages'
import { saveResult } from '../utils/storage'
import { useSubjectData } from '../hooks/useSubjectData'
import { reshuffleQuestion } from '../utils/reshuffleQuestion'
import QuestionCard from './QuestionCard'
import ResultScreen from './ResultScreen'
import './TestPaper.css'

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

/**
 * Mode 1 — Pick a Test Paper
 * Flow: subject selected → pick subtopic → answer all questions → results
 */
export default function TestPaper() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const subject = getSubjectById(subjectId)
  const { data: subjectData, loading: dataLoading } = useSubjectData(subjectId)

  const [stage, setStage] = useState('pick-subtopic') // 'pick-subtopic' | 'answering' | 'results'
  const [selectedSubtopic, setSelectedSubtopic] = useState(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [newBadges, setNewBadges] = useState([])
  const [answers, setAnswers] = useState({}) // questionId → letter
  const [answeredSet, setAnsweredSet] = useState(new Set())
  const [skippedSet, setSkippedSet] = useState(new Set())

  if (!subject) {
    return (
      <div className="tp-error">
        <p>Subject not found.</p>
        <button onClick={() => navigate('/')}>Home</button>
      </div>
    )
  }

  if (dataLoading) {
    return <div className="tp-error"><p>Loading questions…</p></div>
  }

  const subtopics = getSubtopics(subjectData)

  const handlePickSubtopic = (subtopic) => {
    setSelectedSubtopic({
      ...subtopic,
      questions: shuffleArray((subtopic.questions || []).map((question) => reshuffleQuestion(question))),
    })
    setCurrentIndex(0)
    setAnswers({})
    setAnsweredSet(new Set())
    setSkippedSet(new Set())
    setStage('answering')
  }

  const handleAnswer = (letter) => {
    const question = selectedSubtopic.questions[currentIndex]
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
    if (currentIndex < selectedSubtopic.questions.length - 1) {
      setCurrentIndex((i) => i + 1)
    } else {
      // Submit
      const details = selectedSubtopic.questions.map((q) => ({
        question: q,
        userAnswer: answers[q.id] || null,
        skipped: effectiveSkipped.has(q.id),
        correct: answers[q.id] === q.correctAnswer,
      }))
      const score = details.filter((d) => d.correct).length
      setNewBadges(saveResult({
        mode: 'Test Paper',
        subject: subject.label,
        subtopic: selectedSubtopic.label,
        score,
        total: selectedSubtopic.questions.length,
        details,
      }))
      setStage('results')
    }
  }

  const handleSkip = () => {
    const question = selectedSubtopic.questions[currentIndex]
    const nextSkipped = new Set([...skippedSet, question.id])
    setSkippedSet(nextSkipped)
    handleNext(nextSkipped)
  }

  if (stage === 'pick-subtopic') {
    return (
      <div className="tp-page">
        <header className="tp-header" style={{ '--subj-color': subject.color }}>
          <button className="tp-back" onClick={() => navigate('/subject-picker/test-paper')}>← Back</button>
          <span className="tp-subject-emoji">{subject.emoji}</span>
          <h2 className="tp-title">{subject.label}</h2>
          <p className="tp-subtitle">Choose a topic</p>
        </header>

        <div className="tp-subtopics">
          {subtopics.map((st) => (
            <button
              key={st.key}
              className="tp-subtopic-btn"
              style={{ '--subj-color': subject.color, '--subj-bg': subject.bgColor }}
              onClick={() => handlePickSubtopic(st)}
            >
              <span className="tp-subtopic-label">{st.label}</span>
              <span className="tp-subtopic-count">{st.questions.length} questions</span>
              <span className="tp-subtopic-arrow">›</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (stage === 'results') {
    const details = selectedSubtopic.questions.map((q) => ({
      question: q,
      userAnswer: answers[q.id] || null,
      skipped: skippedSet.has(q.id),
      correct: answers[q.id] === q.correctAnswer,
    }))
    const score = details.filter((d) => d.correct).length

    return (
      <div className="tp-page">
        <div className="tp-results-back">
          <button className="tp-back-btn" onClick={() => navigate('/')}>← Home</button>
        </div>
        <ResultScreen
          score={score}
          total={selectedSubtopic.questions.length}
          mode="test"
          subjectLabel={`${subject.label} › ${selectedSubtopic.label}`}
          details={details}
          onRestart={() => {
            setStage('pick-subtopic')
            setSelectedSubtopic(null)
          }}
          newBadges={newBadges}
        />
      </div>
    )
  }

  // Answering stage
  const question = selectedSubtopic.questions[currentIndex]
  const isAnswered = answeredSet.has(question.id)
  const isLast = currentIndex === selectedSubtopic.questions.length - 1
  const isSkipped = skippedSet.has(question.id)
  const readingPassage = subject?.id === 'english'
    ? getEnglishReadingPassageByQuestionCode(question.questionCode)
    : null

  return (
    <div className="tp-page">
      <header className="tp-header" style={{ '--subj-color': subject.color }}>
        <button className="tp-back" onClick={() => setStage('pick-subtopic')}>← Topics</button>
        <div className="tp-header-info">
          <span className="tp-subject-name">{subject.label}</span>
          <span className="tp-subtopic-name">{selectedSubtopic.label}</span>
        </div>
      </header>

      <div className="tp-content">
        <QuestionCard
          question={question}
          questionNumber={currentIndex + 1}
          totalQuestions={selectedSubtopic.questions.length}
          onAnswer={handleAnswer}
          showFeedback={true}
          passage={readingPassage}
        />

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          {!isAnswered && !isSkipped && (
            <button className="tp-next-btn tp-skip-btn" onClick={handleSkip} type="button">
              {isLast ? 'Skip and Submit' : 'Skip Question'}
            </button>
          )}
          {(isAnswered || isSkipped) && (
            <button className="tp-next-btn" onClick={() => handleNext()} type="button">
              {isLast ? 'Submit Paper' : 'Next Question →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
