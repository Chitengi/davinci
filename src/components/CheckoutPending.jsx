import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { subscriptionApi } from '../utils/subscriptionApi'
import { useSubscription } from '../context/SubscriptionContext'
import './CheckoutPending.css'

const TERMINAL_STATES = new Set(['paid', 'failed', 'canceled', 'expired'])

export default function CheckoutPending() {
  const navigate = useNavigate()
  const { paymentId } = useParams()
  const [searchParams] = useSearchParams()
  const { refreshSubscription } = useSubscription()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusData, setStatusData] = useState(null)
  const [markingPaid, setMarkingPaid] = useState(false)

  const nextPath = searchParams.get('next') || '/'

  const fetchStatus = useCallback(async () => {
    if (!paymentId) return

    try {
      const data = await subscriptionApi.getPaymentStatus(paymentId)
      setStatusData(data)
      setError('')
      if (data.payment?.status === 'paid') {
        await refreshSubscription()
      }
    } catch (err) {
      setError(err.message || 'Failed to fetch payment status.')
    } finally {
      setLoading(false)
    }
  }, [paymentId, refreshSubscription])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (!statusData || TERMINAL_STATES.has(statusData.payment?.status)) return undefined

    const timer = window.setInterval(() => {
      fetchStatus()
    }, 3000)

    return () => {
      window.clearInterval(timer)
    }
  }, [fetchStatus, statusData])

  const handleSimulateSuccess = async () => {
    if (!paymentId) return

    setMarkingPaid(true)
    setError('')
    try {
      await subscriptionApi.devMarkPaid(paymentId)
      await fetchStatus()
    } catch (err) {
      setError(err.message || 'Failed to simulate payment success.')
    } finally {
      setMarkingPaid(false)
    }
  }

  const status = statusData?.payment?.status || 'pending'
  const provider = statusData?.payment?.provider || ''

  return (
    <div className="checkout-page">
      <div className="checkout-card">
        <h1 className="checkout-title">Payment Status</h1>
        {loading ? (
          <p className="checkout-muted">Checking payment status...</p>
        ) : (
          <>
            <p className="checkout-line">Payment ID: {paymentId}</p>
            <p className="checkout-line">Current status: <strong>{status}</strong></p>
            {statusData?.subscription?.planName && (
              <p className="checkout-line">Plan: {statusData.subscription.planName}</p>
            )}

            {status === 'paid' && (
              <>
                <p className="checkout-success">Payment completed. Premium access is now active.</p>
                <button className="checkout-primary" onClick={() => navigate(nextPath, { replace: true })}>
                  Continue Learning
                </button>
              </>
            )}

            {status === 'pending' && (
              <p className="checkout-muted">Waiting for provider confirmation. This page refreshes automatically.</p>
            )}

            {(status === 'failed' || status === 'canceled' || status === 'expired') && (
              <>
                <p className="checkout-error">Payment did not complete successfully. Please try again.</p>
                <button className="checkout-primary" onClick={() => navigate('/paywall', { replace: true })}>
                  Retry Payment
                </button>
              </>
            )}

            {provider === 'test' && status === 'pending' && (
              <button
                className="checkout-secondary"
                onClick={handleSimulateSuccess}
                disabled={markingPaid}
              >
                {markingPaid ? 'Marking paid...' : 'Simulate Success (Dev)'}
              </button>
            )}
          </>
        )}

        {error && <p className="checkout-error">{error}</p>}
      </div>
    </div>
  )
}
