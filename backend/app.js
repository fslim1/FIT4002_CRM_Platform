const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
const helmet = require('helmet')
const path = require('path')

// Loaded here as well as in server.js so the app can be required directly by
// tests without going through the server entry point. dotenv does not override
// variables that are already set, so calling it twice is a no-op; `quiet`
// keeps the second call from repeating the startup banner.
dotenv.config({quiet: true})

const authRoutes = require('./routes/auth')

const app = express()

app.set('trust proxy', 1)

app.use(helmet())

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

app.use(
    cors({
        origin: (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true)
            // Carries its own status so the error handler below can answer 403
            // rather than treating a rejected origin as a server fault.
            const rejected = new Error('Origin not allowed by CORS')
            rejected.status = 403
            return cb(rejected)
        },
        credentials: true,
    })
)

app.use(express.json({limit: '100kb'}))

// Serve uploads statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.get('/', (req, res) => {
    res.send('NexGen CRM backend is running')
})

// Routes — all must be registered before error handlers
app.use('/api/auth', authRoutes)
app.use('/api/admin', require('./routes/adminRoutes'))
app.use('/api/customers', require('./routes/customerRoutes'))
app.use('/api/interactions', require('./routes/interactionRoutes'))
app.use('/api/deals', require('./routes/dealRoutes'))
app.use('/api/tasks', require('./routes/taskRoutes'))
app.use('/api/notifications', require('./routes/notificationsRoutes'))
app.use('/api/users', require('./routes/userRoutes'))
app.use('/api/teams', require('./routes/teamRoutes'))
app.use('/api/settings', require('./routes/settingsRoutes'))
app.use('/api/portal', require('./routes/portalRoutes'))
app.use('/api/dashboard', require('./routes/dashboardRoutes'))
app.use('/api/risk-benchmarks', require('./routes/riskBenchmarkRoutes'))
app.use('/api/relationship-graph', require('./routes/relationshipGraphRoutes'))

// Error handler — always last.
//
// One handler, not two: Express calls a four-argument handler only when
// something has already failed, so a second one placed after this could never
// run. The status chosen here is the status the client sees.
//
// Middleware raises errors that already know their status — a malformed JSON
// body is 400, an oversized one 413, a rejected origin 403. Anything without
// one is a fault on our side, so it answers 500 and says no more than that: an
// internal message can describe the database or the file system to a caller.
app.use((err, req, res, next) => {
    if (res.headersSent) return next(err)

    const status = err.status || err.statusCode || 500
    if (status >= 500) console.error('Unhandled error:', err)

    res.status(status).json({
        message: status >= 500 ? 'Internal server error' : err.message,
    })
})

module.exports = app
