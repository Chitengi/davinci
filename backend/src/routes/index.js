import { Router } from 'express'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { requireLearner } from '../middleware/requireLearner.js'
import { query, pool } from '../db.js'

const router = Router()

// ── Rate limiters ───────────────────────────────────────────────────────────

// Generous limit for question browsing — 120 requests per minute per IP
const questionsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.header('x-learner-id') || ipKeyGenerator(req.ip),
  message: { error: 'Too many requests. Please slow down.' },
})

// Strict limiter for random endpoint to prevent bulk harvesting
const randomLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.header('x-learner-id') || ipKeyGenerator(req.ip),
  message: { error: 'Too many requests. Please slow down.' },
})

const PROVIDERS = new Set([
  'airtel_money',
  'mtn_money',
  'zamtel_konnect',
  'card',
  'test',
])

const PAYMENT_STATUS_MAP = {
  success: 'paid',
  paid: 'paid',
  failed: 'failed',
  cancelled: 'canceled',
  canceled: 'canceled',
  expired: 'expired',
  pending: 'pending',
}

const ADMIN_SEVERITIES = new Set(['info', 'warning', 'urgent'])
const FREE_DAILY_QUESTION_LIMIT = Number(process.env.FREE_DAILY_QUESTION_LIMIT || 30)
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const AIRTEL_AUTH_PATH_DEFAULT = '/auth/oauth2/token'
const AIRTEL_COLLECTION_PATH_DEFAULT = '/merchant/v1/payments/'
const AIRTEL_TIMEOUT_MS_DEFAULT = 15000

const resolveAirtelBaseUrl = () => {
  const isProd = process.env.NODE_ENV === 'production'
  const stagingUrl = String(process.env.AIRTEL_BASE_URL || '').trim() || 'https://openapiuat.airtel.co.zm'
  const productionUrl = String(process.env.AIRTEL_PROD_BASE_URL || '').trim() || 'https://openapi.airtel.co.zm'

  return {
    mode: isProd ? 'production' : 'staging',
    baseUrl: isProd ? productionUrl : stagingUrl,
  }
}

const joinUrl = (baseUrl, path) => {
  const base = String(baseUrl || '').replace(/\/+$/, '')
  const suffix = String(path || '').replace(/^\/+/, '')
  return `${base}/${suffix}`
}

const parsePositiveInt = (value, fallback) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const resolveAirtelConfig = () => {
  const base = resolveAirtelBaseUrl()
  return {
    ...base,
    clientId: String(process.env.AIRTEL_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.AIRTEL_CLIENT_SECRET || '').trim(),
    countryCode: String(process.env.AIRTEL_COUNTRY_CODE || 'ZM').trim().toUpperCase(),
    currency: String(process.env.AIRTEL_CURRENCY || 'ZMW').trim().toUpperCase(),
    authPath: String(process.env.AIRTEL_AUTH_PATH || AIRTEL_AUTH_PATH_DEFAULT).trim(),
    collectionPath: String(process.env.AIRTEL_COLLECTION_PATH || AIRTEL_COLLECTION_PATH_DEFAULT).trim(),
    callbackUrl: String(process.env.AIRTEL_CALLBACK_URL || '').trim() || null,
    timeoutMs: parsePositiveInt(process.env.AIRTEL_TIMEOUT_MS, AIRTEL_TIMEOUT_MS_DEFAULT),
  }
}

const sanitizePhoneMsisdn = (phoneNumber) => String(phoneNumber || '').replace(/[^0-9]/g, '')

const parseAirtelResponseStatus = (payload) => {
  const statusObj = payload?.status ?? {}
  const code = String(statusObj.code ?? payload?.code ?? '').trim()
  const message = String(statusObj.message ?? payload?.message ?? '').trim() || 'Unknown Airtel response status'
  const explicitSuccess = statusObj.success === true
  const codeSuccess = /^2\d\d$/.test(code)
  const providerStatus = explicitSuccess || codeSuccess ? 'pending' : 'failed'

  return {
    providerStatus,
    statusCode: code || undefined,
    statusMessage: message,
  }
}

async function requestAirtelAccessToken(config) {
  if (!config.clientId || !config.clientSecret) {
    throw new Error('Missing Airtel credentials. Set AIRTEL_CLIENT_ID and AIRTEL_CLIENT_SECRET.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(joinUrl(config.baseUrl, config.authPath), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: 'client_credentials',
      }),
      signal: controller.signal,
    })

    const text = await response.text()
    let payload = {}
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = { raw: text }
    }

    if (!response.ok) {
      throw new Error(`Airtel auth failed (${response.status}): ${JSON.stringify(payload)}`)
    }

    const accessToken = payload?.access_token || payload?.token?.access_token || payload?.data?.access_token
    if (!accessToken) {
      throw new Error('Airtel auth succeeded but no access token was returned.')
    }

    return {
      accessToken,
      payload,
    }
  } finally {
    clearTimeout(timeout)
  }
}

async function initiateAirtelCollectionPayment({
  config,
  amount,
  currency,
  phoneNumber,
  providerReference,
  returnUrl,
}) {
  const { accessToken, payload: authPayload } = await requestAirtelAccessToken(config)
  const msisdn = sanitizePhoneMsisdn(phoneNumber)

  const body = {
    reference: providerReference,
    subscriber: {
      country: config.countryCode,
      currency: config.currency,
      msisdn,
    },
    transaction: {
      amount: Number(amount).toFixed(2),
      country: config.countryCode,
      currency: String(currency || config.currency).toUpperCase(),
      id: providerReference,
    },
  }

  if (returnUrl) {
    body.transaction.redirect_url = returnUrl
  }

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'X-Country': config.countryCode,
    'X-Currency': String(currency || config.currency).toUpperCase(),
  }

  if (config.callbackUrl) {
    headers['X-Callback-Url'] = config.callbackUrl
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs)

  try {
    const response = await fetch(joinUrl(config.baseUrl, config.collectionPath), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const text = await response.text()
    let payload = {}
    try {
      payload = text ? JSON.parse(text) : {}
    } catch {
      payload = { raw: text }
    }

    const status = parseAirtelResponseStatus(payload)
    if (!response.ok) {
      throw new Error(`Airtel payment initiation failed (${response.status}): ${JSON.stringify(payload)}`)
    }

    return {
      providerStatus: status.providerStatus,
      statusCode: status.statusCode,
      statusMessage: status.statusMessage,
      remoteTransactionId:
        payload?.data?.transaction?.id || payload?.data?.id || payload?.transaction?.id || payload?.id || null,
      checkoutUrl: payload?.data?.checkoutUrl || payload?.checkoutUrl || null,
      authPayload,
      requestPayload: body,
      responsePayload: payload,
    }
  } finally {
    clearTimeout(timeout)
  }
}

const hasAdminAccess = (req) => {
  const provided = String(req.header('x-admin-key') || '').trim()
  const configured = String(process.env.ADMIN_API_KEY || '').trim()

  if (!configured) {
    return {
      ok: false,
      reason: 'Server admin key is not configured. Set ADMIN_API_KEY in backend environment.',
      status: 500,
    }
  }

  if (!provided || provided !== configured) {
    return {
      ok: false,
      reason: 'Admin access denied. Provide a valid x-admin-key.',
      status: 403,
    }
  }

  return {
    ok: true,
    reason: '',
    status: 200,
  }
}

const requireAdmin = (req, res, next) => {
  const access = hasAdminAccess(req)
  if (!access.ok) {
    return res.status(access.status).json({ error: access.reason })
  }
  return next()
}

const ensureAdminAlertsTable = async () => {
  await query(
    `
      create table if not exists public.admin_alerts (
        id uuid primary key default gen_random_uuid(),
        title text not null,
        message text not null,
        severity text not null default 'info' check (severity in ('info', 'warning', 'urgent')),
        audience text not null default 'all',
        created_at timestamptz not null default now()
      )
    `,
    [],
  )
}

const isSubscriptionActive = (subscription) => {
  if (!subscription) return false
  if (!['active', 'trialing'].includes(subscription.status)) return false
  if (!subscription.ends_at) return true
  return new Date(subscription.ends_at).getTime() > Date.now()
}

async function getOrCreateLearnerByExternalId(externalId) {
  const inserted = await query(
    `
      insert into public.learners (external_id)
      values ($1)
      on conflict (external_id)
      do update set external_id = excluded.external_id
      returning id, external_id, display_name
    `,
    [externalId],
  )

  return inserted.rows[0]
}

const getTodayDateKey = () => new Date().toISOString().slice(0, 10)

async function getCurrentOpenSubscription(learnerId) {
  const result = await query(
    `
      select s.id, s.status, s.starts_at, s.ends_at, s.updated_at,
             p.code as plan_code, p.name as plan_name, p.amount_zmw, p.billing_cycle, p.currency
      from public.subscriptions s
      join public.subscription_plans p on p.id = s.plan_id
      where s.learner_id = $1
        and s.status in ('trialing', 'active', 'past_due', 'pending_payment')
      order by s.updated_at desc
      limit 1
    `,
    [learnerId],
  )

  return result.rows[0] || null
}

async function ensureDailyUsageTable() {
  await query(
    `
      create table if not exists public.learner_daily_question_usage (
        learner_id uuid not null references public.learners(id) on delete cascade,
        usage_date date not null,
        questions_served integer not null default 0 check (questions_served >= 0),
        updated_at timestamptz not null default now(),
        primary key (learner_id, usage_date)
      )
    `,
    [],
  )
}

async function getDailyQuotaUsage(learnerId) {
  await ensureDailyUsageTable()
  const today = getTodayDateKey()
  const usage = await query(
    `
      select questions_served
      from public.learner_daily_question_usage
      where learner_id = $1 and usage_date = $2::date
      limit 1
    `,
    [learnerId, today],
  )

  const usedToday = Number(usage.rows[0]?.questions_served || 0)
  const remainingToday = Math.max(FREE_DAILY_QUESTION_LIMIT - usedToday, 0)

  return {
    dailyLimit: FREE_DAILY_QUESTION_LIMIT,
    usedToday,
    remainingToday,
  }
}

async function consumeFreeQuestionQuota(learnerId, requestedCount) {
  await ensureDailyUsageTable()
  const today = getTodayDateKey()
  const safeRequested = Math.max(Number(requestedCount) || 0, 0)

  if (safeRequested === 0) {
    const current = await getDailyQuotaUsage(learnerId)
    return {
      allowedCount: 0,
      ...current,
    }
  }

  const client = await pool.connect()
  try {
    await client.query('begin')

    await client.query(
      `
        insert into public.learner_daily_question_usage (learner_id, usage_date, questions_served)
        values ($1, $2::date, 0)
        on conflict (learner_id, usage_date) do nothing
      `,
      [learnerId, today],
    )

    const currentUsage = await client.query(
      `
        select questions_served
        from public.learner_daily_question_usage
        where learner_id = $1 and usage_date = $2::date
        for update
      `,
      [learnerId, today],
    )

    const usedToday = Number(currentUsage.rows[0]?.questions_served || 0)
    const remainingBefore = Math.max(FREE_DAILY_QUESTION_LIMIT - usedToday, 0)
    const allowedCount = Math.min(remainingBefore, safeRequested)

    if (allowedCount > 0) {
      await client.query(
        `
          update public.learner_daily_question_usage
          set
            questions_served = questions_served + $3,
            updated_at = now()
          where learner_id = $1 and usage_date = $2::date
        `,
        [learnerId, today, allowedCount],
      )
    }

    await client.query('commit')

    const usedAfter = usedToday + allowedCount
    return {
      allowedCount,
      dailyLimit: FREE_DAILY_QUESTION_LIMIT,
      usedToday: usedAfter,
      remainingToday: Math.max(FREE_DAILY_QUESTION_LIMIT - usedAfter, 0),
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

async function getLearnerAccessState(learnerId) {
  const subscription = await getCurrentOpenSubscription(learnerId)
  const isPremium = isSubscriptionActive(subscription)

  if (isPremium) {
    return {
      subscription,
      accessTier: 'premium',
      hasAccess: true,
      canAccessQuestions: true,
      questionAllowance: null,
    }
  }

  const quota = await getDailyQuotaUsage(learnerId)
  return {
    subscription,
    accessTier: 'free',
    hasAccess: false,
    canAccessQuestions: true,
    questionAllowance: quota,
  }
}

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'upps-subscriptions-api' })
})

router.get('/plans', async (_req, res, next) => {
  try {
    const plans = await query(
      `
        select id, code, name, description, amount_zmw, currency, billing_cycle
        from public.subscription_plans
        where is_active = true
        order by amount_zmw asc
      `,
      [],
    )

    res.json({ plans: plans.rows })
  } catch (error) {
    next(error)
  }
})

router.get('/admin/plans', requireAdmin, async (_req, res, next) => {
  try {
    const plans = await query(
      `
        select id, code, name, description, amount_zmw, currency, billing_cycle, is_active, created_at
        from public.subscription_plans
        order by amount_zmw asc
      `,
      [],
    )

    res.json({ plans: plans.rows })
  } catch (error) {
    next(error)
  }
})

router.patch('/admin/plans/:planCode', requireAdmin, async (req, res, next) => {
  try {
    const planCode = String(req.params.planCode || '').trim()
    const amountZmw = Number(req.body?.amountZmw)

    if (!planCode) {
      return res.status(400).json({ error: 'planCode is required in path.' })
    }

    if (!Number.isFinite(amountZmw) || amountZmw <= 0) {
      return res.status(400).json({ error: 'amountZmw must be a number greater than 0.' })
    }

    const updated = await query(
      `
        update public.subscription_plans
        set amount_zmw = $2
        where code = $1
        returning id, code, name, description, amount_zmw, currency, billing_cycle, is_active
      `,
      [planCode, amountZmw],
    )

    if (updated.rows.length === 0) {
      return res.status(404).json({ error: `Plan not found for code: ${planCode}` })
    }

    return res.json({ ok: true, plan: updated.rows[0] })
  } catch (error) {
    next(error)
  }
})

router.post('/admin/alerts', requireAdmin, async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim()
    const message = String(req.body?.message || '').trim()
    const severity = String(req.body?.severity || 'info').toLowerCase()
    const audience = String(req.body?.audience || 'all').trim() || 'all'

    if (!title || !message) {
      return res.status(400).json({ error: 'title and message are required.' })
    }

    if (!ADMIN_SEVERITIES.has(severity)) {
      return res.status(400).json({ error: 'severity must be one of info, warning, urgent.' })
    }

    await ensureAdminAlertsTable()

    const inserted = await query(
      `
        insert into public.admin_alerts (title, message, severity, audience)
        values ($1, $2, $3, $4)
        returning id, title, message, severity, audience, created_at
      `,
      [title, message, severity, audience],
    )

    return res.status(201).json({ ok: true, alert: inserted.rows[0] })
  } catch (error) {
    next(error)
  }
})

router.get('/admin/alerts', requireAdmin, async (req, res, next) => {
  try {
    await ensureAdminAlertsTable()
    const limitRaw = Number(req.query?.limit || 20)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 20

    const rows = await query(
      `
        select id, title, message, severity, audience, created_at
        from public.admin_alerts
        order by created_at desc
        limit $1
      `,
      [limit],
    )

    return res.json({ alerts: rows.rows })
  } catch (error) {
    next(error)
  }
})

router.post('/admin/learners/:learnerExternalId/reset', requireAdmin, async (req, res, next) => {
  const learnerExternalId = String(req.params.learnerExternalId || '').trim()

  if (!UUID_REGEX.test(learnerExternalId)) {
    return res.status(400).json({ error: 'learnerExternalId must be a valid UUID.' })
  }

  const client = await pool.connect()
  try {
    await client.query('begin')

    const learnerResult = await client.query(
      `
        select id, external_id
        from public.learners
        where external_id = $1
        limit 1
      `,
      [learnerExternalId],
    )

    if (learnerResult.rows.length === 0) {
      await client.query('rollback')
      return res.status(404).json({ error: `Learner not found for external ID: ${learnerExternalId}` })
    }

    const learner = learnerResult.rows[0]

    const canceled = await client.query(
      `
        update public.subscriptions
        set status = 'canceled', canceled_at = now(), updated_at = now()
        where learner_id = $1
          and status in ('trialing', 'active', 'past_due', 'pending_payment')
        returning id
      `,
      [learner.id],
    )

    const usageCleared = await client.query(
      `
        delete from public.learner_daily_question_usage
        where learner_id = $1
      `,
      [learner.id],
    )

    await client.query('commit')

    return res.json({
      ok: true,
      learnerExternalId: learner.external_id,
      canceledSubscriptions: canceled.rowCount,
      usageRowsCleared: usageCleared.rowCount,
    })
  } catch (error) {
    await client.query('rollback')
    next(error)
  } finally {
    client.release()
  }
})

router.get('/subscriptions/me', requireLearner, async (req, res, next) => {
  try {
    const learner = await getOrCreateLearnerByExternalId(req.learnerExternalId)
    const accessState = await getLearnerAccessState(learner.id)

    res.json({
      learnerId: learner.external_id,
      hasAccess: accessState.hasAccess,
      canAccessQuestions: accessState.canAccessQuestions,
      accessTier: accessState.accessTier,
      questionAllowance: accessState.questionAllowance,
      subscription: accessState.subscription,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/subscriptions/start-trial', requireLearner, async (req, res, next) => {
  try {
    const learner = await getOrCreateLearnerByExternalId(req.learnerExternalId)

    const existingOpen = await query(
      `
        select id, status, starts_at, ends_at
        from public.subscriptions
        where learner_id = $1
          and status in ('trialing', 'active', 'past_due', 'pending_payment')
        order by updated_at desc
        limit 1
      `,
      [learner.id],
    )

    if (existingOpen.rows.length > 0) {
      return res.status(409).json({
        error: 'You already have an active or pending subscription/trial.',
      })
    }

    const priorTrial = await query(
      `
        select id
        from public.subscriptions
        where learner_id = $1
          and starts_at is not null
          and ends_at is not null
          and ends_at <= starts_at + interval '8 days'
        limit 1
      `,
      [learner.id],
    )

    if (priorTrial.rows.length > 0) {
      return res.status(409).json({ error: 'Free trial has already been used for this learner.' })
    }

    const trialPlan = await query(
      `
        select id, code, name
        from public.subscription_plans
        where is_active = true and billing_cycle = 'monthly'
        order by amount_zmw asc
        limit 1
      `,
      [],
    )

    if (trialPlan.rows.length === 0) {
      return res.status(404).json({ error: 'No active plan is configured for trial linkage.' })
    }

    const inserted = await query(
      `
        insert into public.subscriptions (learner_id, plan_id, status, starts_at, ends_at)
        values ($1, $2, 'trialing', now(), now() + interval '7 days')
        returning id, status, starts_at, ends_at
      `,
      [learner.id, trialPlan.rows[0].id],
    )

    return res.status(201).json({
      ok: true,
      trialDays: 7,
      subscription: inserted.rows[0],
      plan: {
        code: trialPlan.rows[0].code,
        name: trialPlan.rows[0].name,
      },
    })
  } catch (error) {
    next(error)
  }
})

router.post('/subscriptions/cancel', requireLearner, async (req, res, next) => {
  try {
    const learner = await getOrCreateLearnerByExternalId(req.learnerExternalId)

    const canceled = await query(
      `
        update public.subscriptions
        set status = 'canceled', canceled_at = now(), updated_at = now()
        where learner_id = $1
          and status in ('trialing', 'active', 'past_due', 'pending_payment')
        returning id, status, ends_at, canceled_at
      `,
      [learner.id],
    )

    res.json({
      canceled: canceled.rows.length > 0,
      subscription: canceled.rows[0] ?? null,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/payments/initiate', requireLearner, async (req, res, next) => {
  const { planCode, provider, phoneNumber, returnUrl } = req.body ?? {}
  const airtelConfig = provider === 'airtel_money' ? resolveAirtelConfig() : null

  if (!planCode) {
    return res.status(400).json({ error: 'planCode is required.' })
  }

  if (!provider || !PROVIDERS.has(provider)) {
    return res.status(400).json({
      error: 'provider is required and must be one of airtel_money, mtn_money, zamtel_konnect, card, test.',
    })
  }

  if (!phoneNumber || !/^\+?[0-9]{10,15}$/.test(String(phoneNumber))) {
    return res.status(400).json({
      error: 'phoneNumber is required in E.164-like format.',
    })
  }

  const client = await pool.connect()

  try {
    await client.query('begin')

    const learner = await getOrCreateLearnerByExternalId(req.learnerExternalId)

    const planResult = await client.query(
      `
        select id, code, name, amount_zmw, currency, billing_cycle
        from public.subscription_plans
        where code = $1 and is_active = true
        limit 1
      `,
      [planCode],
    )

    if (planResult.rows.length === 0) {
      await client.query('rollback')
      return res.status(404).json({ error: `No active plan found for code: ${planCode}` })
    }

    const plan = planResult.rows[0]

    const upsertSubscription = await client.query(
      `
        with current_open as (
          select id
          from public.subscriptions
          where learner_id = $1
            and status in ('trialing', 'active', 'past_due', 'pending_payment')
          order by updated_at desc
          limit 1
        )
        update public.subscriptions s
        set
          plan_id = $2,
          status = 'pending_payment',
          updated_at = now()
        where s.id in (select id from current_open)
        returning s.id, s.status
      `,
      [learner.id, plan.id],
    )

    let subscription = upsertSubscription.rows[0]

    if (!subscription) {
      const insertedSubscription = await client.query(
        `
          insert into public.subscriptions (learner_id, plan_id, status)
          values ($1, $2, 'pending_payment')
          returning id, status
        `,
        [learner.id, plan.id],
      )
      subscription = insertedSubscription.rows[0]
    }

    const providerReference = `${provider}-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const airtelResult =
      provider === 'airtel_money'
        ? await initiateAirtelCollectionPayment({
            config: airtelConfig,
            amount: plan.amount_zmw,
            currency: plan.currency,
            phoneNumber,
            providerReference,
            returnUrl,
          })
        : null

    const paymentResult = await client.query(
      `
        insert into public.payment_transactions
          (learner_id, plan_id, subscription_id, provider, provider_reference, phone_number, amount_zmw, currency, status, checkout_url, metadata)
        values
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
        returning id, status, provider_reference, amount_zmw, currency, checkout_url, requested_at
      `,
      [
        learner.id,
        plan.id,
        subscription.id,
        provider,
        providerReference,
        phoneNumber,
        plan.amount_zmw,
        plan.currency,
        airtelResult?.providerStatus || 'pending',
        airtelResult?.checkoutUrl || returnUrl || null,
        JSON.stringify({
          provider,
          planCode,
          phoneNumber,
          ...(airtelConfig
            ? {
                airtel: {
                  mode: airtelConfig.mode,
                  baseUrl: airtelConfig.baseUrl,
                  countryCode: airtelConfig.countryCode,
                  currency: airtelConfig.currency,
                  statusCode: airtelResult?.statusCode,
                  statusMessage: airtelResult?.statusMessage,
                  remoteTransactionId: airtelResult?.remoteTransactionId || null,
                  authResponse: airtelResult?.authPayload,
                  requestPayload: airtelResult?.requestPayload,
                  responsePayload: airtelResult?.responsePayload,
                },
              }
            : {}),
        }),
      ],
    )

    await client.query('commit')

    const payment = paymentResult.rows[0]

    return res.status(201).json({
      paymentId: payment.id,
      providerReference: payment.provider_reference,
      status: payment.status,
      amount: {
        value: payment.amount_zmw,
        currency: payment.currency,
      },
      instructions:
        provider === 'test'
          ? 'Use POST /api/v1/dev/payments/:paymentId/mark-paid to simulate success in development.'
          : provider === 'airtel_money'
            ? 'Airtel payment initiated. Prompt learner to approve on phone and poll status endpoint.'
          : 'Pending provider callback. Poll this payment status endpoint.',
      checkoutUrl: payment.checkout_url,
      providerConfig: airtelConfig
        ? {
            mode: airtelConfig.mode,
            baseUrl: airtelConfig.baseUrl,
          }
        : undefined,
      providerStatus: airtelResult
        ? {
            statusCode: airtelResult.statusCode,
            statusMessage: airtelResult.statusMessage,
            remoteTransactionId: airtelResult.remoteTransactionId,
          }
        : undefined,
      requestedAt: payment.requested_at,
    })
  } catch (error) {
    await client.query('rollback')
    next(error)
  } finally {
    client.release()
  }
})

router.get('/payments/:paymentId/status', requireLearner, async (req, res, next) => {
  try {
    const learner = await getOrCreateLearnerByExternalId(req.learnerExternalId)

    const payment = await query(
      `
        select pt.id, pt.status, pt.provider, pt.provider_reference, pt.amount_zmw, pt.currency, pt.requested_at, pt.paid_at,
               s.status as subscription_status, s.starts_at, s.ends_at,
               p.code as plan_code, p.name as plan_name
        from public.payment_transactions pt
        join public.subscription_plans p on p.id = pt.plan_id
        left join public.subscriptions s on s.id = pt.subscription_id
        where pt.id = $1 and pt.learner_id = $2
        limit 1
      `,
      [req.params.paymentId, learner.id],
    )

    if (payment.rows.length === 0) {
      return res.status(404).json({ error: 'Payment not found.' })
    }

    const row = payment.rows[0]

    return res.json({
      payment: {
        id: row.id,
        status: row.status,
        provider: row.provider,
        providerReference: row.provider_reference,
        amount: row.amount_zmw,
        currency: row.currency,
        requestedAt: row.requested_at,
        paidAt: row.paid_at,
      },
      subscription: row.subscription_status
        ? {
            status: row.subscription_status,
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            planCode: row.plan_code,
            planName: row.plan_name,
          }
        : null,
    })
  } catch (error) {
    next(error)
  }
})

router.post('/payments/webhook/:provider', async (req, res, next) => {
  try {
    const providedSecret = req.header('x-webhook-secret')
    if (!providedSecret || providedSecret !== process.env.PAYMENT_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Invalid webhook secret.' })
    }

    const provider = req.params.provider
    if (!PROVIDERS.has(provider)) {
      return res.status(400).json({ error: 'Unsupported provider in path.' })
    }

    const providerReference = req.body?.providerReference
    const normalizedStatus = PAYMENT_STATUS_MAP[String(req.body?.status || '').toLowerCase()]

    if (!providerReference || !normalizedStatus) {
      return res.status(400).json({
        error: 'providerReference and status are required in webhook payload.',
      })
    }

    const client = await pool.connect()

    try {
      await client.query('begin')

      const paymentLookup = await client.query(
        `
          select id, learner_id, plan_id, subscription_id, status
          from public.payment_transactions
          where provider_reference = $1
          limit 1
        `,
        [providerReference],
      )

      if (paymentLookup.rows.length === 0) {
        await client.query('rollback')
        return res.status(404).json({ error: 'Unknown providerReference.' })
      }

      const payment = paymentLookup.rows[0]

      await client.query(
        `
          insert into public.payment_events (payment_id, event_type, payload)
          values ($1, $2, $3::jsonb)
        `,
        [payment.id, `webhook.${provider}.${normalizedStatus}`, JSON.stringify(req.body ?? {})],
      )

      await client.query(
        `
          update public.payment_transactions
          set
            status = $2,
            paid_at = case when $2 = 'paid' then now() else paid_at end,
            failed_at = case when $2 in ('failed', 'canceled', 'expired') then now() else failed_at end
          where id = $1
        `,
        [payment.id, normalizedStatus],
      )

      if (normalizedStatus === 'paid') {
        const planLookup = await client.query(
          `
            select billing_cycle
            from public.subscription_plans
            where id = $1
            limit 1
          `,
          [payment.plan_id],
        )

        const billingCycle = planLookup.rows[0]?.billing_cycle ?? 'monthly'
        const intervalText = billingCycle === 'yearly' ? '365 days' : '30 days'

        await client.query(
          `
            update public.subscriptions
            set
              status = 'active',
              starts_at = now(),
              ends_at = now() + $2::interval,
              canceled_at = null,
              updated_at = now()
            where id = $1
          `,
          [payment.subscription_id, intervalText],
        )
      } else if (['failed', 'canceled', 'expired'].includes(normalizedStatus)) {
        await client.query(
          `
            update public.subscriptions
            set status = 'expired', updated_at = now()
            where id = $1 and status = 'pending_payment'
          `,
          [payment.subscription_id],
        )
      }

      await client.query('commit')
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }

    return res.json({ ok: true })
  } catch (error) {
    next(error)
  }
})

router.post('/dev/payments/:paymentId/mark-paid', async (req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Disabled in production.' })
  }

  try {
    const client = await pool.connect()

    try {
      await client.query('begin')

      const paymentLookup = await client.query(
        `
          select id, plan_id, subscription_id, status
          from public.payment_transactions
          where id = $1
          limit 1
        `,
        [req.params.paymentId],
      )

      if (paymentLookup.rows.length === 0) {
        await client.query('rollback')
        return res.status(404).json({ error: 'Payment not found.' })
      }

      const payment = paymentLookup.rows[0]

      await client.query(
        `
          update public.payment_transactions
          set status = 'paid', paid_at = now()
          where id = $1
        `,
        [payment.id],
      )

      const planLookup = await client.query(
        `
          select billing_cycle
          from public.subscription_plans
          where id = $1
          limit 1
        `,
        [payment.plan_id],
      )

      const billingCycle = planLookup.rows[0]?.billing_cycle ?? 'monthly'
      const intervalText = billingCycle === 'yearly' ? '365 days' : '30 days'

      await client.query(
        `
          update public.subscriptions
          set
            status = 'active',
            starts_at = now(),
            ends_at = now() + $2::interval,
            canceled_at = null,
            updated_at = now()
          where id = $1
        `,
        [payment.subscription_id, intervalText],
      )

      await client.query('commit')

      return res.json({ ok: true, paymentId: payment.id, status: 'paid' })
    } catch (error) {
      await client.query('rollback')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    next(error)
  }
})

// ── Questions API ───────────────────────────────────────────────────────────
// Served through this backend so the Supabase service key is never
// exposed to the browser. Rate-limited to deter bulk scraping.

/**
 * GET /api/v1/questions/:subjectId
 * Returns all questions for a subject, optionally filtered to one subtopic.
 * ?subtopic=Text_only_questions
 *
 * Requires x-learner-id header (must be a valid UUID).
 */
router.get('/questions/:subjectId', questionsLimiter, requireLearner, async (req, res, next) => {
  try {
    const subjectId = String(req.params.subjectId || '').trim()
    const subtopic  = String(req.query.subtopic  || '').trim()
    const learner = await getOrCreateLearnerByExternalId(req.learnerExternalId)

    const accessState = await getLearnerAccessState(learner.id)

    if (!subjectId) {
      return res.status(400).json({ error: 'subjectId is required.' })
    }

    let sql    = `SELECT id, subtopic, question_code, question_raw, option_a, option_b, option_c, option_d, option_e, diagram_code
                  FROM public.questions
                  WHERE subject_id = $1`
    const args = [subjectId]

    if (subtopic) {
      sql += ` AND subtopic = $2`
      args.push(subtopic)
    }

    sql += ` ORDER BY random()`

    const result = await query(sql, args)

    if (result.rows.length === 0) {
      return res.status(404).json({ error: `No questions found for subject: ${subjectId}` })
    }

    if (accessState.accessTier === 'premium') {
      return res.json({ questions: result.rows })
    }

    const quotaUse = await consumeFreeQuestionQuota(learner.id, result.rows.length)
    if (quotaUse.allowedCount <= 0) {
      return res.status(402).json({
        error: 'Daily free question limit reached. Please come back tomorrow or subscribe for unlimited access.',
        accessTier: 'free',
        questionAllowance: {
          dailyLimit: quotaUse.dailyLimit,
          usedToday: quotaUse.usedToday,
          remainingToday: quotaUse.remainingToday,
        },
      })
    }

    return res.json({
      questions: result.rows.slice(0, quotaUse.allowedCount),
      accessTier: 'free',
      questionAllowance: {
        dailyLimit: quotaUse.dailyLimit,
        usedToday: quotaUse.usedToday,
        remainingToday: quotaUse.remainingToday,
      },
      partial: quotaUse.allowedCount < result.rows.length,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/v1/questions/:subjectId/subtopics
 * Returns a list of distinct subtopic names for a subject (no question content).
 */
router.get('/questions/:subjectId/subtopics', questionsLimiter, requireLearner, async (req, res, next) => {
  try {
    const subjectId = String(req.params.subjectId || '').trim()
    if (!subjectId) return res.status(400).json({ error: 'subjectId is required.' })

    const result = await query(
      `SELECT DISTINCT subtopic FROM public.questions WHERE subject_id = $1 ORDER BY subtopic`,
      [subjectId],
    )

    return res.json({ subtopics: result.rows.map((r) => r.subtopic) })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/v1/questions/random?count=10
 * Returns N random questions from ALL subjects (default 10, max 20).
 * Requires x-learner-id header.
 */
router.get('/questions-random', randomLimiter, requireLearner, async (req, res, next) => {
  try {
    const countRaw = Number(req.query.count ?? 10)
    const count    = Number.isFinite(countRaw) ? Math.min(Math.max(countRaw, 1), 20) : 10
    const learner = await getOrCreateLearnerByExternalId(req.learnerExternalId)
    const accessState = await getLearnerAccessState(learner.id)

    const requestedCount =
      accessState.accessTier === 'premium'
        ? count
        : Math.min(count, Math.max(accessState.questionAllowance?.remainingToday || 0, 0))

    if (requestedCount <= 0) {
      return res.status(402).json({
        error: 'Daily free question limit reached. Please come back tomorrow or subscribe for unlimited access.',
        accessTier: 'free',
        questionAllowance: accessState.questionAllowance,
      })
    }

    const result = await query(
      `SELECT q.id, q.subject_id, q.subject_label, q.subtopic, q.question_code,
              q.question_raw, q.option_a, q.option_b, q.option_c, q.option_d, q.option_e, q.diagram_code
       FROM public.questions q
       ORDER BY random()
       LIMIT $1`,
      [requestedCount],
    )

    if (accessState.accessTier === 'premium') {
      return res.json({ questions: result.rows })
    }

    const quotaUse = await consumeFreeQuestionQuota(learner.id, result.rows.length)

    return res.json({
      questions: result.rows,
      accessTier: 'free',
      questionAllowance: {
        dailyLimit: quotaUse.dailyLimit,
        usedToday: quotaUse.usedToday,
        remainingToday: quotaUse.remainingToday,
      },
      partial: result.rows.length < count,
    })
  } catch (error) {
    next(error)
  }
})

// ── Learner profile helpers ─────────────────────────────────────────────────

function hashPin(pin) {
  const salt = randomBytes(16).toString('hex')
  const derived = scryptSync(String(pin), salt, 32).toString('hex')
  return `${salt}:${derived}`
}

function verifyPin(pin, stored) {
  try {
    const [salt, derivedHex] = stored.split(':')
    const derived = scryptSync(String(pin), salt, 32)
    const storedBuf = Buffer.from(derivedHex, 'hex')
    return timingSafeEqual(derived, storedBuf)
  } catch {
    return false
  }
}

// ── GET /learners/me/profile ─────────────────────────────────────────────────
// Returns the learner's saved profile (display_name, grade, guardian_phone, registered_at)
// Used by the frontend to decide whether to show the registration modal.

router.get('/learners/me/profile', requireLearner, async (req, res, next) => {
  try {
    const learner = await getOrCreateLearnerByExternalId(req.learnerExternalId)
    const row = await query(
      `select display_name, grade, guardian_phone, registered_at
         from public.learners where id = $1`,
      [learner.id],
    )
    const profile = row.rows[0] || {}
    return res.json({
      displayName: profile.display_name || null,
      grade: profile.grade || null,
      guardianPhone: profile.guardian_phone || null,
      isRegistered: Boolean(profile.registered_at),
    })
  } catch (err) {
    next(err)
  }
})

// ── PATCH /learners/me ───────────────────────────────────────────────────────
// Saves profile on first registration. Can also update display_name / grade later.

const profileRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.header('x-learner-id') || ipKeyGenerator(req.ip),
  message: { error: 'Too many profile update attempts. Please wait.' },
})

router.patch('/learners/me', requireLearner, profileRateLimit, async (req, res, next) => {
  try {
    const { displayName, grade, pin, guardianPhone } = req.body || {}

    // Validate display name
    if (displayName !== undefined) {
      if (typeof displayName !== 'string' || displayName.trim().length < 2 || displayName.trim().length > 30) {
        return res.status(400).json({ error: 'Display name must be 2–30 characters.' })
      }
    }

    // Validate grade
    if (grade !== undefined) {
      const g = Number(grade)
      if (![5, 6, 7].includes(g)) {
        return res.status(400).json({ error: 'Grade must be 5, 6, or 7.' })
      }
    }

    // Validate PIN (4 digits)
    if (pin !== undefined) {
      if (!/^\d{4}$/.test(String(pin))) {
        return res.status(400).json({ error: 'PIN must be exactly 4 digits.' })
      }
    }

    // Validate guardian phone (optional, basic sanity check)
    if (guardianPhone !== undefined && guardianPhone !== null && guardianPhone !== '') {
      if (!/^\+?[\d\s\-]{7,15}$/.test(String(guardianPhone))) {
        return res.status(400).json({ error: 'Invalid guardian phone number.' })
      }
    }

    const learner = await getOrCreateLearnerByExternalId(req.learnerExternalId)

    // Build dynamic update
    const setClauses = []
    const values = []

    if (displayName !== undefined) {
      values.push(displayName.trim())
      setClauses.push(`display_name = $${values.length}`)
    }
    if (grade !== undefined) {
      values.push(Number(grade))
      setClauses.push(`grade = $${values.length}`)
    }
    if (pin !== undefined) {
      values.push(hashPin(pin))
      setClauses.push(`pin_hash = $${values.length}`)
    }
    if (guardianPhone !== undefined) {
      values.push(guardianPhone ? String(guardianPhone).trim() : null)
      setClauses.push(`guardian_phone = $${values.length}`)
    }

    // Mark as registered on first save
    setClauses.push(`registered_at = coalesce(registered_at, now())`)

    if (setClauses.length === 1) {
      // Only registered_at — nothing meaningful to update
      return res.status(400).json({ error: 'No profile fields provided.' })
    }

    values.push(learner.id)
    const updated = await query(
      `update public.learners
          set ${setClauses.join(', ')}
        where id = $${values.length}
        returning display_name, grade, guardian_phone, registered_at`,
      values,
    )

    const p = updated.rows[0]
    return res.json({
      ok: true,
      displayName: p.display_name,
      grade: p.grade,
      guardianPhone: p.guardian_phone,
      isRegistered: Boolean(p.registered_at),
    })
  } catch (err) {
    next(err)
  }
})

// ── POST /learners/verify-pin ────────────────────────────────────────────────
// Verifies PIN for PIN-locked features (future use)

router.post('/learners/verify-pin', requireLearner, async (req, res, next) => {
  try {
    const { pin } = req.body || {}
    if (!pin || !/^\d{4}$/.test(String(pin))) {
      return res.status(400).json({ error: 'PIN must be exactly 4 digits.' })
    }

    const learner = await getOrCreateLearnerByExternalId(req.learnerExternalId)
    const row = await query(
      `select pin_hash from public.learners where id = $1`,
      [learner.id],
    )
    const pinHash = row.rows[0]?.pin_hash
    if (!pinHash) {
      return res.status(400).json({ error: 'No PIN set for this account.' })
    }

    const valid = verifyPin(pin, pinHash)
    return res.json({ valid })
  } catch (err) {
    next(err)
  }
})

export default router
