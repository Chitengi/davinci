import pg from 'pg'

const { Pool } = pg

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

const databaseUrl = process.env.DATABASE_URL
const isSupabaseHost = /supabase\.(co|com)/i.test(databaseUrl)
let connectionString = databaseUrl

if (isSupabaseHost) {
  try {
    const parsed = new URL(databaseUrl)
    // Rely on explicit pg ssl config below for Supabase pooler hosts.
    parsed.searchParams.delete('sslmode')
    connectionString = parsed.toString()
  } catch {
    connectionString = databaseUrl
  }
}

export const pool = new Pool({
  connectionString,
  ssl: isSupabaseHost
    ? { rejectUnauthorized: false }
    : undefined,
})

export const query = (text, params) => pool.query(text, params)
