const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
const helmet = require('helmet')
const path = require('path')

// Tests load app.js directly, so load environment variables here too.
dotenv.config({quiet: true})

const authRoutes = require('./routes/auth')

const app = express()

app.set('trust proxy', 1)
app.use(helmet())

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

app.use(
    cors({
        origin: (origin, cb) => {
            if (!origin || allowedOrigins.includes(origin)) return cb(null, true)

            const rejected = new Error('Origin not allowed by CORS')
            rejected.status = 403
            return cb(rejected)
        },
        credentials: true,
    })
)

app.use(express.json({limit: '100kb'}))
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))

app.get('/', (req, res) => {
    res.send('NexGen CRM backend is running')
})

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

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err)

    const status = err.status || err.statusCode || 500
    if (status >= 500) console.error('Unhandled error:', err)

    return res.status(status).json({
        message: status >= 500 ? 'Internal server error' : err.message,
    })
})

module.exports = app
