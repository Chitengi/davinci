import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Home from './components/Home'
import SubjectPicker from './components/SubjectPicker'
import TestPaper from './components/TestPaper'
import QuizMode from './components/QuizMode'
import RandomQuiz from './components/RandomQuiz'
import Flashcards from './components/Flashcards'
import Performance from './components/Performance'
import SplashScreen from './components/SplashScreen'
import Paywall from './components/Paywall'
import CheckoutPending from './components/CheckoutPending'
import AdminPage from './components/AdminPage'
import RegistrationModal from './components/RegistrationModal'
import { SubscriptionProvider, useSubscription } from './context/SubscriptionContext'
import { subscriptionApi } from './utils/subscriptionApi'

function PremiumRoute({ children }) {
  const location = useLocation()
  const { canAccessQuestions, loading } = useSubscription()

  if (loading) {
    return <div style={{ padding: '2rem' }}>Checking subscription...</div>
  }

  if (!canAccessQuestions) {
    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/paywall?next=${encodeURIComponent(next)}`} replace />
  }

  return children
}

function PostSplashSubscriptionRedirect({ showSplash, showRegistration }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { loading, hasAccess } = useSubscription()

  useEffect(() => {
    if (showSplash || showRegistration || loading) return
    if (hasAccess) return
    if (location.pathname !== '/') return

    navigate('/paywall?next=%2F', { replace: true })
  }, [showSplash, showRegistration, loading, hasAccess, location.pathname, navigate])

  return null
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [showRegistration, setShowRegistration] = useState(false)
  const forceRegistrationPreview =
    new URLSearchParams(window.location.search).get('previewRegistration') === '1'

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setShowSplash(false)
    }, 2600)

    return () => {
      window.clearTimeout(timer)
    }
  }, [])

  // After splash is hidden, check if the learner has a saved profile
  useEffect(() => {
    if (showSplash) return
    if (forceRegistrationPreview) {
      setShowRegistration(true)
      return
    }
    subscriptionApi.getLearnerProfile()
      .then((profile) => {
        if (!profile.isRegistered) {
          setShowRegistration(true)
        }
      })
      .catch(() => {
        // Backend unreachable — skip registration silently
      })
  }, [showSplash, forceRegistrationPreview])

  return (
    <SubscriptionProvider>
      <HashRouter>
        <PostSplashSubscriptionRedirect
          showSplash={showSplash}
          showRegistration={showRegistration}
        />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/paywall" element={<Paywall />} />
          <Route path="/checkout/:paymentId" element={<CheckoutPending />} />
          <Route path="/subject-picker/:mode" element={<SubjectPicker />} />
          <Route
            path="/test-paper/:subjectId"
            element={<PremiumRoute><TestPaper /></PremiumRoute>}
          />
          <Route
            path="/quiz/:subjectId"
            element={<PremiumRoute><QuizMode /></PremiumRoute>}
          />
          <Route
            path="/random"
            element={<PremiumRoute><RandomQuiz /></PremiumRoute>}
          />
          <Route
            path="/flashcards/:subjectId"
            element={<PremiumRoute><Flashcards /></PremiumRoute>}
          />
          <Route path="/performance" element={<Performance />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      {showSplash && <SplashScreen onContinue={() => setShowSplash(false)} />}
      {!showSplash && showRegistration && (
        <RegistrationModal
          onComplete={() => setShowRegistration(false)}
          onGoToPaywall={() => {
            setShowRegistration(false)
            window.location.hash = '/paywall'
          }}
          previewMode={forceRegistrationPreview}
        />
      )}
    </SubscriptionProvider>
  )
}
