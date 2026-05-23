import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import routes from './routes/index.js'

export const app = express()

const corsOrigin = process.env.CORS_ORIGIN || '*'

app.use(cors({ origin: corsOrigin }))
app.use(express.json())

app.use('/api/v1', routes)

app.use((req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.path}` })
})

app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({
    error: 'Internal server error',
    detail: process.env.NODE_ENV === 'production' ? undefined : err.message,
  })
})
