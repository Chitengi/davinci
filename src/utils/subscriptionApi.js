const API_BASE = (() => {
  const configured = import.meta.env.VITE_API_BASE_URL
  if (configured) return configured

  // In local dev, call backend directly if no proxy/env is configured.
  if (import.meta.env.DEV) return 'http://localhost:4000/api/v1'

  // In production, prefer same-origin API path.
  return '/api/v1'
})()
const LEARNER_KEY = 'upps_learner_id'

function getOrCreateLearnerId() {
  const existing = localStorage.getItem(LEARNER_KEY)
  if (existing) return existing

  const generated = crypto.randomUUID()
  localStorage.setItem(LEARNER_KEY, generated)
  return generated
}

async function apiFetch(path, options = {}) {
  const learnerId = getOrCreateLearnerId()

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        'x-learner-id': learnerId,
        ...(options.headers || {}),
      },
    })
  } catch {
    throw new Error(
      `Cannot reach subscription API at ${API_BASE}. Set VITE_API_BASE_URL or start backend on port 4000.`,
    )
  }

  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(body.error || `Request failed (${response.status})`)
  }

  return body
}

export const subscriptionApi = {
  async getPlans() {
    return apiFetch('/plans', { method: 'GET' })
  },

  async getMySubscription() {
    return apiFetch('/subscriptions/me', { method: 'GET' })
  },

  async startTrial() {
    return apiFetch('/subscriptions/start-trial', { method: 'POST' })
  },

  async initiatePayment(payload) {
    return apiFetch('/payments/initiate', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  async getPaymentStatus(paymentId) {
    return apiFetch(`/payments/${paymentId}/status`, { method: 'GET' })
  },

  async cancelSubscription() {
    return apiFetch('/subscriptions/cancel', { method: 'POST' })
  },

  async devMarkPaid(paymentId) {
    return apiFetch(`/dev/payments/${paymentId}/mark-paid`, { method: 'POST' })
  },

  async adminGetPlans(adminKey) {
    return apiFetch('/admin/plans', {
      method: 'GET',
      headers: {
        'x-admin-key': adminKey || '',
      },
    })
  },

  async adminUpdatePlan(planCode, payload, adminKey) {
    return apiFetch(`/admin/plans/${encodeURIComponent(planCode)}`, {
      method: 'PATCH',
      headers: {
        'x-admin-key': adminKey || '',
      },
      body: JSON.stringify(payload || {}),
    })
  },

  async adminSendAlert(payload, adminKey) {
    return apiFetch('/admin/alerts', {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey || '',
      },
      body: JSON.stringify(payload || {}),
    })
  },

  async adminListAlerts(adminKey) {
    return apiFetch('/admin/alerts', {
      method: 'GET',
      headers: {
        'x-admin-key': adminKey || '',
      },
    })
  },

  async adminResetLearner(learnerExternalId, adminKey) {
    return apiFetch(`/admin/learners/${encodeURIComponent(learnerExternalId)}/reset`, {
      method: 'POST',
      headers: {
        'x-admin-key': adminKey || '',
      },
    })
  },

  getLearnerId() {
    return getOrCreateLearnerId()
  },

  resetLearnerIdentity() {
    localStorage.removeItem(LEARNER_KEY)
    return getOrCreateLearnerId()
  },

  async getLearnerProfile() {
    return apiFetch('/learners/me/profile', { method: 'GET' })
  },

  async updateLearnerProfile(payload) {
    return apiFetch('/learners/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },
}
