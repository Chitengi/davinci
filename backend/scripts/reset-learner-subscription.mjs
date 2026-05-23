import 'dotenv/config'
import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required in backend/.env')
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('supabase.co')
    ? { rejectUnauthorized: false }
    : undefined,
})

function parseArgs(argv) {
  const args = {
    learnerId: '',
    listActive: false,
    latestActive: false,
    confirm: false,
    preserveHistory: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--learner-id') {
      args.learnerId = String(argv[i + 1] || '').trim()
      i += 1
    } else if (token === '--list-active') {
      args.listActive = true
    } else if (token === '--latest-active') {
      args.latestActive = true
    } else if (token === '--confirm') {
      args.confirm = true
    } else if (token === '--preserve-history') {
      args.preserveHistory = true
    }
  }

  return args
}

async function listActiveLearners(client) {
  const result = await client.query(
    `
      select
        l.external_id,
        s.status,
        s.updated_at,
        p.code as plan_code
      from public.subscriptions s
      join public.learners l on l.id = s.learner_id
      join public.subscription_plans p on p.id = s.plan_id
      where s.status in ('trialing', 'active', 'past_due', 'pending_payment')
      order by s.updated_at desc
    `,
  )
  return result.rows
}

async function resolveLearnerExternalId(client, args) {
  if (args.learnerId) {
    return args.learnerId
  }

  if (!args.latestActive) {
    throw new Error('Provide --learner-id <uuid> or use --latest-active.')
  }

  const active = await listActiveLearners(client)
  const uniqueLearners = [...new Set(active.map((row) => row.external_id))]

  if (uniqueLearners.length === 0) {
    throw new Error('No active/trialing learners found.')
  }

  if (uniqueLearners.length > 1) {
    throw new Error(
      `Multiple active learners found (${uniqueLearners.length}). Re-run with --learner-id <uuid>.`,
    )
  }

  return uniqueLearners[0]
}

async function run() {
  const args = parseArgs(process.argv.slice(2))
  const client = await pool.connect()

  try {
    if (args.listActive) {
      const rows = await listActiveLearners(client)
      if (rows.length === 0) {
        console.log('No active/trialing subscriptions found.')
      } else {
        console.log('Active/trialing subscriptions:')
        for (const row of rows) {
          console.log(`${row.external_id} | ${row.status} | ${row.plan_code} | ${row.updated_at.toISOString()}`)
        }
      }
      return
    }

    const learnerExternalId = await resolveLearnerExternalId(client, args)

    if (!args.confirm) {
      throw new Error('Missing --confirm flag. This command changes subscription data.')
    }

    await client.query('begin')

    const learnerLookup = await client.query(
      `select id, external_id from public.learners where external_id = $1 limit 1`,
      [learnerExternalId],
    )

    if (learnerLookup.rows.length === 0) {
      await client.query('rollback')
      throw new Error(`Learner not found for external id: ${learnerExternalId}`)
    }

    const learnerId = learnerLookup.rows[0].id

    const canceled = await client.query(
      `
        update public.subscriptions
        set status = 'canceled', canceled_at = now(), updated_at = now()
        where learner_id = $1
          and status in ('trialing', 'active', 'past_due', 'pending_payment')
        returning id
      `,
      [learnerId],
    )

    let deletedSubscriptions = 0
    let deletedPayments = 0
    let deletedPaymentEvents = 0
    let deletedDailyUsage = 0

    if (!args.preserveHistory) {
      const paymentIds = await client.query(
        `select id from public.payment_transactions where learner_id = $1`,
        [learnerId],
      )

      if (paymentIds.rows.length > 0) {
        const ids = paymentIds.rows.map((row) => row.id)
        const deletedEvents = await client.query(
          `delete from public.payment_events where payment_id = any($1::uuid[])`,
          [ids],
        )
        deletedPaymentEvents = deletedEvents.rowCount
      }

      const deletedTx = await client.query(
        `delete from public.payment_transactions where learner_id = $1`,
        [learnerId],
      )
      deletedPayments = deletedTx.rowCount

      const deletedSubs = await client.query(
        `delete from public.subscriptions where learner_id = $1`,
        [learnerId],
      )
      deletedSubscriptions = deletedSubs.rowCount

      const deletedQuota = await client.query(
        `delete from public.learner_daily_question_usage where learner_id = $1`,
        [learnerId],
      )
      deletedDailyUsage = deletedQuota.rowCount
    }

    await client.query('commit')

    console.log('Reset completed successfully.')
    console.log(`Learner external_id: ${learnerExternalId}`)
    console.log(`Canceled active subscriptions: ${canceled.rowCount}`)
    if (!args.preserveHistory) {
      console.log(`Deleted subscriptions: ${deletedSubscriptions}`)
      console.log(`Deleted payment transactions: ${deletedPayments}`)
      console.log(`Deleted payment events: ${deletedPaymentEvents}`)
      console.log(`Deleted daily usage rows: ${deletedDailyUsage}`)
    } else {
      console.log('History preserved: yes (only active status was canceled).')
    }
    console.log('Learner now starts from default free plan on next check.')
  } catch (error) {
    try {
      await client.query('rollback')
    } catch {
      // ignore nested rollback errors
    }
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

run().catch((error) => {
  const detail =
    (error && typeof error.stack === 'string' && error.stack.trim()) ||
    (error && typeof error.message === 'string' && error.message.trim()) ||
    String(error)
  console.error(`Reset failed: ${detail}`)
  process.exit(1)
})
