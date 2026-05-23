import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { subscriptionApi } from '../utils/subscriptionApi'

const SubscriptionContext = createContext(null)
const ENABLE_SUBSCRIPTION_CHECKS = String(import.meta.env?.VITE_ENABLE_SUBSCRIPTION_CHECKS || 'false').toLowerCase() === 'true'

export function SubscriptionProvider({ children }) {
  const [loading, setLoading] = useState(ENABLE_SUBSCRIPTION_CHECKS)
  const [hasAccess, setHasAccess] = useState(!ENABLE_SUBSCRIPTION_CHECKS)
  const [canAccessQuestions, setCanAccessQuestions] = useState(true)
  const [accessTier, setAccessTier] = useState(ENABLE_SUBSCRIPTION_CHECKS ? 'free' : 'premium')
  const [questionAllowance, setQuestionAllowance] = useState(null)
  const [subscription, setSubscription] = useState(
    ENABLE_SUBSCRIPTION_CHECKS
      ? null
      : {
          status: 'active',
          plan: 'dev-bypass',
        }
  )
  const [error, setError] = useState('')

  const refreshSubscription = useCallback(async () => {
    if (!ENABLE_SUBSCRIPTION_CHECKS) {
      setLoading(false)
      setHasAccess(true)
      setCanAccessQuestions(true)
      setAccessTier('premium')
      setQuestionAllowance(null)
      setError('')
      return
    }

    setLoading(true)
    setError('')

    try {
      const data = await subscriptionApi.getMySubscription()
      setHasAccess(Boolean(data.hasAccess))
      setCanAccessQuestions(Boolean(data.canAccessQuestions ?? data.hasAccess))
      setAccessTier(String(data.accessTier || (data.hasAccess ? 'premium' : 'free')))
      setQuestionAllowance(data.questionAllowance || null)
      setSubscription(data.subscription || null)
    } catch (err) {
      setHasAccess(false)
      setCanAccessQuestions(false)
      setAccessTier('free')
      setQuestionAllowance(null)
      setSubscription(null)
      setError(err.message || 'Failed to load subscription status.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshSubscription()
  }, [refreshSubscription])

  const value = useMemo(
    () => ({
      loading,
      hasAccess,
      canAccessQuestions,
      accessTier,
      questionAllowance,
      subscription,
      error,
      learnerId: subscriptionApi.getLearnerId(),
      refreshSubscription,
    }),
    [
      loading,
      hasAccess,
      canAccessQuestions,
      accessTier,
      questionAllowance,
      subscription,
      error,
      refreshSubscription,
    ],
  )

  return <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
}

export function useSubscription() {
  const context = useContext(SubscriptionContext)
  if (!context) {
    throw new Error('useSubscription must be used inside SubscriptionProvider.')
  }
  return context
}
