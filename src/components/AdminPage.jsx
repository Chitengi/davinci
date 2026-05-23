import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { subscriptionApi } from '../utils/subscriptionApi'
import './AdminPage.css'

const DEFAULT_SEVERITY = 'info'
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default function AdminPage() {
  const navigate = useNavigate()

  const [adminKey, setAdminKey] = useState('')
  const [plans, setPlans] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [loadingAlerts, setLoadingAlerts] = useState(false)
  const [savingCode, setSavingCode] = useState('')
  const [sendingAlert, setSendingAlert] = useState(false)
  const [resettingLearner, setResettingLearner] = useState(false)
  const [resettingSelectedLearner, setResettingSelectedLearner] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [alertTitle, setAlertTitle] = useState('')
  const [alertMessage, setAlertMessage] = useState('')
  const [alertSeverity, setAlertSeverity] = useState(DEFAULT_SEVERITY)
  const [targetLearnerId, setTargetLearnerId] = useState('')

  const clearMessages = () => {
    setError('')
    setSuccess('')
  }

  const loadPlans = async () => {
    if (!adminKey.trim()) {
      setError('Admin key is required.')
      setSuccess('')
      return
    }

    setLoadingPlans(true)
    clearMessages()
    try {
      const data = await subscriptionApi.adminGetPlans(adminKey)
      const fetched = Array.isArray(data.plans) ? data.plans : []
      setPlans(fetched.map((plan) => ({ ...plan, amountDraft: String(plan.amount_zmw) })))
      setSuccess('Loaded plans successfully.')
    } catch (err) {
      setError(err.message || 'Failed to load plans.')
    } finally {
      setLoadingPlans(false)
    }
  }

  const loadAlerts = async () => {
    if (!adminKey.trim()) {
      setError('Admin key is required.')
      setSuccess('')
      return
    }

    setLoadingAlerts(true)
    clearMessages()
    try {
      const data = await subscriptionApi.adminListAlerts(adminKey)
      setAlerts(Array.isArray(data.alerts) ? data.alerts : [])
      setSuccess('Loaded alerts successfully.')
    } catch (err) {
      setError(err.message || 'Failed to load alerts.')
    } finally {
      setLoadingAlerts(false)
    }
  }

  useEffect(() => {
    if (!adminKey) return
    loadPlans()
    loadAlerts()
  }, [])

  const updatePlanDraft = (planCode, value) => {
    setPlans((prev) => prev.map((plan) => (
      plan.code === planCode ? { ...plan, amountDraft: value } : plan
    )))
  }

  const handleSavePlan = async (plan) => {
    if (!adminKey.trim()) {
      setError('Admin key is required.')
      return
    }

    const nextAmount = Number(plan.amountDraft)
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      setError('Enter a valid fee amount greater than 0.')
      return
    }

    setSavingCode(plan.code)
    clearMessages()

    try {
      const data = await subscriptionApi.adminUpdatePlan(
        plan.code,
        { amountZmw: nextAmount },
        adminKey,
      )

      const updated = data.plan
      setPlans((prev) => prev.map((row) => (
        row.code === updated.code
          ? { ...row, ...updated, amountDraft: String(updated.amount_zmw) }
          : row
      )))
      setSuccess(`Updated ${updated.name} fee to K${updated.amount_zmw}.`)
    } catch (err) {
      setError(err.message || 'Failed to update plan fee.')
    } finally {
      setSavingCode('')
    }
  }

  const handleSendAlert = async (event) => {
    event.preventDefault()

    if (!adminKey.trim()) {
      setError('Admin key is required.')
      return
    }

    if (!alertTitle.trim() || !alertMessage.trim()) {
      setError('Alert title and message are required.')
      return
    }

    setSendingAlert(true)
    clearMessages()

    try {
      const data = await subscriptionApi.adminSendAlert(
        {
          title: alertTitle.trim(),
          message: alertMessage.trim(),
          severity: alertSeverity,
          audience: 'all',
        },
        adminKey,
      )

      if (data.alert) {
        setAlerts((prev) => [data.alert, ...prev].slice(0, 20))
      }

      setAlertTitle('')
      setAlertMessage('')
      setAlertSeverity(DEFAULT_SEVERITY)
      setSuccess('Alert sent successfully.')
    } catch (err) {
      setError(err.message || 'Failed to send alert.')
    } finally {
      setSendingAlert(false)
    }
  }

  const handleResetCurrentLearner = async () => {
    const proceed = window.confirm(
      'Reset current learner and start from default free plan? This clears local learner identity on this device.',
    )
    if (!proceed) return

    setResettingLearner(true)
    clearMessages()

    try {
      const previousLearnerId = subscriptionApi.getLearnerId()
      const cancelResult = await subscriptionApi.cancelSubscription()
      const nextLearnerId = subscriptionApi.resetLearnerIdentity()

      if (cancelResult?.canceled) {
        setSuccess(
          `Learner reset done. Subscription ${cancelResult.subscription?.id || ''} was canceled. Old ID: ${previousLearnerId}. New ID: ${nextLearnerId}.`,
        )
      } else {
        setSuccess(
          `Learner reset done. No active subscription was found to cancel for learner ${previousLearnerId}. New ID: ${nextLearnerId}.`,
        )
      }
    } catch (err) {
      setError(err.message || 'Failed to reset learner state. No local learner ID was rotated.')
    } finally {
      setResettingLearner(false)
    }
  }

  const handleResetSelectedLearner = async (event) => {
    event.preventDefault()

    if (!adminKey.trim()) {
      setError('Admin key is required.')
      setSuccess('')
      return
    }

    const learnerId = targetLearnerId.trim()
    if (!learnerId) {
      setError('Learner ID is required.')
      setSuccess('')
      return
    }

    if (!UUID_REGEX.test(learnerId)) {
      setError('Learner ID must be a valid UUID.')
      setSuccess('')
      return
    }

    const proceed = window.confirm(
      `Reset learner ${learnerId}? This cancels active subscriptions and clears daily usage for that learner.`,
    )
    if (!proceed) return

    setResettingSelectedLearner(true)
    clearMessages()

    try {
      const data = await subscriptionApi.adminResetLearner(learnerId, adminKey)
      setSuccess(
        `Selected learner reset done for ${data.learnerExternalId}. Canceled subscriptions: ${data.canceledSubscriptions}. Daily usage rows cleared: ${data.usageRowsCleared}.`,
      )
    } catch (err) {
      setError(err.message || 'Failed to reset selected learner.')
    } finally {
      setResettingSelectedLearner(false)
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-card">
        <div className="admin-header-row">
          <h1 className="admin-title">Admin Console</h1>
          <button className="admin-back" type="button" onClick={() => navigate('/')}>Back</button>
        </div>

        <p className="admin-subtitle">Send alerts, adjust fees, and manage learner resets.</p>

        <div className="admin-section">
          <h2 className="admin-section-title">Reset Selected Learner</h2>
          <form className="admin-form" onSubmit={handleResetSelectedLearner}>
            <label className="admin-label" htmlFor="target-learner-id">Learner ID (UUID)</label>
            <div className="admin-inline-actions">
              <input
                id="target-learner-id"
                className="admin-input"
                type="text"
                value={targetLearnerId}
                onChange={(event) => setTargetLearnerId(event.target.value)}
                placeholder="e.g. 11111111-1111-4111-8111-111111111111"
              />
              <button
                className="admin-btn admin-btn--danger"
                type="submit"
                disabled={resettingSelectedLearner || !adminKey.trim() || !targetLearnerId.trim()}
              >
                {resettingSelectedLearner ? 'Resetting...' : 'Reset Selected Learner'}
              </button>
            </div>
          </form>
          <p className="admin-muted">Use this to target a specific learner account by external learner UUID.</p>
        </div>

        <div className="admin-section">
          <h2 className="admin-section-title">Reset Current Device Learner</h2>
          <p className="admin-muted">Testing utility for this browser only. It rotates local learner identity after canceling the current learner subscription.</p>
          <label className="admin-label" htmlFor="admin-key">Admin Key</label>
          <input
            id="admin-key"
            className="admin-input"
            type="password"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder="Enter x-admin-key"
          />
          <div className="admin-actions">
            <button className="admin-btn" type="button" onClick={loadPlans} disabled={loadingPlans || !adminKey.trim()}>
              {loadingPlans ? 'Loading Plans...' : 'Load Plans'}
            </button>
            <button className="admin-btn admin-btn--secondary" type="button" onClick={loadAlerts} disabled={loadingAlerts || !adminKey.trim()}>
              {loadingAlerts ? 'Loading Alerts...' : 'Load Alerts'}
            </button>
            <button className="admin-btn admin-btn--danger" type="button" onClick={handleResetCurrentLearner} disabled={resettingLearner}>
              {resettingLearner ? 'Resetting Learner...' : 'Reset Current Device Learner'}
            </button>
          </div>
        </div>

        <div className="admin-section">
          <h2 className="admin-section-title">Adjust Fees</h2>
          {plans.length === 0 ? (
            <p className="admin-muted">Load plans to edit subscription fees.</p>
          ) : (
            <div className="admin-plan-list">
              {plans.map((plan) => (
                <div key={plan.id || plan.code} className="admin-plan-row">
                  <div className="admin-plan-meta">
                    <div className="admin-plan-name">{plan.name}</div>
                    <div className="admin-plan-code">{plan.code} | {plan.billing_cycle}</div>
                  </div>
                  <div className="admin-plan-edit">
                    <span className="admin-currency">K</span>
                    <input
                      className="admin-fee-input"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={plan.amountDraft ?? plan.amount_zmw}
                      onChange={(event) => updatePlanDraft(plan.code, event.target.value)}
                    />
                    <button
                      className="admin-btn"
                      type="button"
                      onClick={() => handleSavePlan(plan)}
                      disabled={savingCode === plan.code || !adminKey.trim()}
                    >
                      {savingCode === plan.code ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="admin-section">
          <h2 className="admin-section-title">Send Alert</h2>
          <form className="admin-form" onSubmit={handleSendAlert}>
            <label className="admin-label" htmlFor="alert-title">Title</label>
            <input
              id="alert-title"
              className="admin-input"
              type="text"
              value={alertTitle}
              onChange={(event) => setAlertTitle(event.target.value)}
              placeholder="e.g. Weekend revision reminder"
            />

            <label className="admin-label" htmlFor="alert-message">Message</label>
            <textarea
              id="alert-message"
              className="admin-input admin-textarea"
              value={alertMessage}
              onChange={(event) => setAlertMessage(event.target.value)}
              placeholder="Write the alert message for learners"
            />

            <label className="admin-label" htmlFor="alert-severity">Severity</label>
            <select
              id="alert-severity"
              className="admin-input"
              value={alertSeverity}
              onChange={(event) => setAlertSeverity(event.target.value)}
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="urgent">Urgent</option>
            </select>

            <button className="admin-btn" type="submit" disabled={sendingAlert || !adminKey.trim()}>
              {sendingAlert ? 'Sending...' : 'Send Alert'}
            </button>
          </form>
        </div>

        <div className="admin-section">
          <h2 className="admin-section-title">Recent Alerts</h2>
          {alerts.length === 0 ? (
            <p className="admin-muted">No alerts yet.</p>
          ) : (
            <div className="admin-alert-list">
              {alerts.map((alert) => (
                <div key={alert.id} className={`admin-alert admin-alert--${alert.severity || 'info'}`}>
                  <div className="admin-alert-title">{alert.title}</div>
                  <div className="admin-alert-body">{alert.message}</div>
                  <div className="admin-alert-meta">
                    {alert.severity} | {alert.audience} | {new Date(alert.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && <p className="admin-error">{error}</p>}
        {success && <p className="admin-success">{success}</p>}
      </div>
    </div>
  )
}
