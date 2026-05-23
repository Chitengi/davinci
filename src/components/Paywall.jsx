import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { subscriptionApi } from '../utils/subscriptionApi'
import { useSubscription } from '../context/SubscriptionContext'
import './Paywall.css'

const PROVIDERS = [
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'mtn_money', label: 'MTN Mobile Money' },
  { value: 'zamtel_konnect', label: 'Zamtel Konnect' },
  { value: 'card', label: 'Bank Card' },
  { value: 'test', label: 'Test Mode (Development)' },
]

const FALLBACK_PLANS = [
  {
    id: 'fallback-weekly',
    code: 'weekly',
    name: 'Weekly Access',
    amount_zmw: 1,
    billing_cycle: 'week',
    description: 'Full premium access for 7 days at K1.',
  },
  {
    id: 'fallback-monthly',
    code: 'monthly',
    name: 'Monthly Access',
    amount_zmw: 2,
    billing_cycle: 'month',
    description: 'Full premium access for 30 days at K2.',
  },
  {
    id: 'fallback-yearly',
    code: 'yearly',
    name: 'Annual Access',
    amount_zmw: 20,
    billing_cycle: 'year',
    description: 'Full premium access for 365 days at K20.',
  },
]

export default function Paywall() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    hasAccess,
    accessTier,
    questionAllowance,
    subscription,
    loading: checkingSubscription,
    refreshSubscription,
  } = useSubscription()

  const [plans, setPlans] = useState([])
  const [selectedPlanCode, setSelectedPlanCode] = useState('')
  const [provider, setProvider] = useState('test')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loadingPlans, setLoadingPlans] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [startingTrial, setStartingTrial] = useState(false)
  const [plansNotice, setPlansNotice] = useState('')
  const [error, setError] = useState('')

  const nextPath = searchParams.get('next') || '/'

  useEffect(() => {
    let isMounted = true

    async function loadPlans() {
      setLoadingPlans(true)
      setError('')
      setPlansNotice('')
      try {
        const data = await subscriptionApi.getPlans()
        if (!isMounted) return

        const fetchedPlans = Array.isArray(data.plans) && data.plans.length > 0
          ? data.plans
          : FALLBACK_PLANS
        setPlans(fetchedPlans)
        setSelectedPlanCode((current) => current || fetchedPlans[0]?.code || '')
      } catch (err) {
        if (!isMounted) return
        setPlans(FALLBACK_PLANS)
        setSelectedPlanCode((current) => current || FALLBACK_PLANS[0]?.code || '')
        setPlansNotice('Could not load live plans. Showing default plans for now.')
      } finally {
        if (isMounted) setLoadingPlans(false)
      }
    }

    loadPlans()
    return () => {
      isMounted = false
    }
  }, [])

  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.code === selectedPlanCode) || null,
    [plans, selectedPlanCode],
  )

  const handleContinue = () => {
    navigate(nextPath, { replace: true })
  }

  const handleStartCheckout = async (event) => {
    event.preventDefault()
    if (!selectedPlanCode) {
      setError('Please choose a subscription plan.')
      return
    }

    if (!phoneNumber.trim()) {
      setError('Enter the mobile number for payment prompts.')
      return
    }

    setSubmitting(true)
    setError('')

    try {
      const data = await subscriptionApi.initiatePayment({
        planCode: selectedPlanCode,
        provider,
        phoneNumber: phoneNumber.trim(),
        returnUrl: window.location.href,
      })

      const nextQuery = nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''
      navigate(`/checkout/${data.paymentId}${nextQuery}`)
    } catch (err) {
      setError(err.message || 'Failed to initiate payment.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleStartTrial = async () => {
    setStartingTrial(true)
    setError('')

    try {
      await subscriptionApi.startTrial()
      await refreshSubscription()
      navigate(nextPath, { replace: true })
    } catch (err) {
      setError(err.message || 'Failed to start free trial.')
    } finally {
      setStartingTrial(false)
    }
  }

  if (checkingSubscription) {
    return (
      <div className="paywall-page">
        <div className="paywall-card">Checking your subscription...</div>
      </div>
    )
  }

  return (
    <div className="paywall-page">
      <div className="paywall-card">
        <h1 className="paywall-title">Premium Access</h1>
        <p className="paywall-subtitle">Unlock quiz modes, flashcards, and random challenge sets.</p>

        {accessTier === 'free' && questionAllowance && (
          <div className="paywall-active-box" style={{ marginBottom: '0.75rem' }}>
            <h2>Free Plan Active</h2>
            <p>
              Daily Questions Remaining: <strong>{questionAllowance.remainingToday}</strong> / {questionAllowance.dailyLimit}
            </p>
            <p>
              Used Today: <strong>{questionAllowance.usedToday}</strong>
            </p>
          </div>
        )}

        {!hasAccess && (
          <button
            className="paywall-secondary"
            type="button"
            onClick={handleStartTrial}
            disabled={startingTrial}
            style={{ marginTop: 0, marginBottom: '0.75rem' }}
          >
            {startingTrial ? 'Starting Free Trial...' : 'Start 7-Day Free Trial'}
          </button>
        )}

        {hasAccess && subscription && (
          <div className="paywall-active-box">
            <h2>You are subscribed</h2>
            <p>
              Plan: <strong>{subscription.plan_name}</strong>
            </p>
            <p>
              Status: <strong>{subscription.status}</strong>
            </p>
            <button className="paywall-primary" onClick={handleContinue}>Continue</button>
          </div>
        )}

        <form className="paywall-form" onSubmit={handleStartCheckout}>
          <label className="paywall-label">Choose Plan</label>
          <div className="paywall-plans">
            {loadingPlans ? (
              <div className="paywall-muted">Loading plans...</div>
            ) : plans.length === 0 ? (
              <div className="paywall-error">No active plans were returned by the server.</div>
            ) : (
              plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className={`paywall-plan${selectedPlanCode === plan.code ? ' paywall-plan--selected' : ''}`}
                  onClick={() => setSelectedPlanCode(plan.code)}
                >
                  <span className="paywall-plan-name">{plan.name}</span>
                  <span className="paywall-plan-price">K{plan.amount_zmw} / {plan.billing_cycle}</span>
                </button>
              ))
            )}
          </div>

          {selectedPlan && (
            <p className="paywall-plan-description">{selectedPlan.description}</p>
          )}

          {plansNotice && <p className="paywall-muted">{plansNotice}</p>}

          <label className="paywall-label" htmlFor="provider">Payment Provider</label>
          <select
            id="provider"
            className="paywall-input"
            value={provider}
            onChange={(event) => setProvider(event.target.value)}
          >
            {PROVIDERS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <label className="paywall-label" htmlFor="phone">Phone Number</label>
          <input
            id="phone"
            className="paywall-input"
            type="tel"
            placeholder="e.g. +260977123456"
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            autoComplete="tel"
          />

          {error && <p className="paywall-error">{error}</p>}

          <button className="paywall-primary" type="submit" disabled={submitting || loadingPlans || plans.length === 0}>
            {submitting ? 'Starting checkout...' : 'Proceed to Payment'}
          </button>
        </form>

        <button className="paywall-secondary" onClick={() => navigate(-1)}>Back</button>
      </div>
    </div>
  )
}
