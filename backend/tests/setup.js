/**
 * Vitest setupFiles — runs once per test suite (file).
 *
 * Starts a fresh in-memory MongoDB instance for EACH test suite and connects
 * Mongoose to it. This guarantees perfect isolation between test files.
 *
 * The real MONGO_URI from .env is NEVER used during tests.
 * app.js is guarded with NODE_ENV === 'test' so it skips its own connect().
 */

const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')
const emailVerification = require('../services/emailVerification')


vi.mock('express-rate-limit', () => {
    return {
        default: () => (req, res, next) => next()
    }
})

// Monkey-patch verifyEmailExists for all tests to bypass DNS lookups on test emails
const originalVerify = emailVerification.verifyEmailExists
emailVerification.verifyEmailExists = async (email) => {
    const parsed = emailVerification.parseAddress(email)
    if (!parsed) {
        return {
            ok: false,
            verdict: emailVerification.VERDICT.UNDELIVERABLE,
            reason: 'invalid_format',
            message: 'Please provide a valid email address.'
        }
    }
    return { ok: true, verdict: emailVerification.VERDICT.DELIVERABLE, reason: 'mocked_for_test' }
}

const mailer = require('../services/mailer')
mailer.isMailConfigured = () => true
mailer.sendMail = async (msg) => {
    const match = msg.subject && msg.subject.match(/^(\d{6})/)
    if (match) global.__LAST_SENT_CODE = match[1]
    return true
}
mailer.describeMailError = (err) => err.message


let mongod


beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production'
    process.env.JWT_EXPIRES_IN = '1h'
    process.env.SIGNUP_EMAIL_CONFIRMATION = 'off'

    mongod = await MongoMemoryServer.create({
        binary: { version: '7.0.0' }
    })
    const uri = mongod.getUri()
    process.env.MONGO_URI = uri

    await mongoose.connect(uri)
})

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.dropDatabase()
        await mongoose.connection.close()
    }
    if (mongod) {
        await mongod.stop()
    }
})
