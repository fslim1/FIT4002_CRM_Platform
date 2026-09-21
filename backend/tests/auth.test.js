/**
 * Auth endpoint tests — /api/auth
 *
 * Behaviours verified against the actual authController.js and User model:
 *
 *  POST /api/auth/signup
 *    - 201  happy-path: returns token + safe user object
 *    - 400  missing required fields (fullName, email, password, companyName)
 *    - 400  password shorter than 8 chars (caught by authController before DB)
 *    - 409  duplicate email (caught by authController after DB findOne)
 *
 *  POST /api/auth/login
 *    - 200  valid credentials: returns token + user
 *    - 400  missing email or password field
 *    - 401  wrong password
 *    - 401  unknown email (controller returns same message as wrong password)
 *
 *  GET /api/auth/me
 *    - 200  valid Bearer token: returns { user: ... }
 *    - 401  no Authorization header
 *    - 401  malformed / invalid token
 *
 *  GET /api/auth/config
 *    - 200  always public; returns googleClientId field
 */




const request = require('supertest')
const mongoose = require('mongoose')
const app = require('../app')
const User = require('../models/User')

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BASE_USER = {
    fullName: 'Test User',
    email: 'testuser@example.com',
    password: 'Password123',
    companyName: 'Test Co',
}

/** POST /api/auth/signup and return the full response */
const signup = (body) => request(app).post('/api/auth/signup').send(body)

/** POST /api/auth/login and return the full response */
const login = (body) => request(app).post('/api/auth/login').send(body)

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    // Always start each test with a clean users collection.
    await User.deleteMany({})
})

// ─── Signup ───────────────────────────────────────────────────────────────────

describe('POST /api/auth/signup', () => {
    it('201 — creates a user and returns a JWT + safe user object', async () => {
        const res = await signup(BASE_USER)
        if (res.status !== 201) console.log('SIGNUP ERROR:', res.body)
        expect(res.status).toBe(201)
        expect(res.body.token).toBeTruthy()
        expect(res.body.user).toBeDefined()
        expect(res.body.user.email).toBe(BASE_USER.email)
        expect(res.body.user.role).toBe('User')
        // password must NOT be exposed in the response
        expect(res.body.user.password).toBeUndefined()
    })

    it('400 — missing fullName returns error message', async () => {
        const { fullName, ...body } = BASE_USER
        const res = await signup(body)
        expect(res.status).toBe(400)
        expect(res.body.message).toBeTruthy()
    })

    it('400 — missing email returns error message', async () => {
        const { email, ...body } = BASE_USER
        const res = await signup(body)
        expect(res.status).toBe(400)
        expect(res.body.message).toBeTruthy()
    })

    it('400 — missing companyName returns error message', async () => {
        const { companyName, ...body } = BASE_USER
        const res = await signup(body)
        expect(res.status).toBe(400)
        expect(res.body.message).toBeTruthy()
    })

    it('400 — password shorter than 8 chars is rejected', async () => {
        const res = await signup({ ...BASE_USER, password: 'short' })
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/8/i)
    })

    it('409 — duplicate email returns conflict error', async () => {
        // First signup succeeds
        await signup(BASE_USER)
        // Second signup with same email must fail
        const res = await signup(BASE_USER)
        expect(res.status).toBe(409)
        expect(res.body.message).toBeTruthy()
    })
})

// ─── Login ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
    beforeEach(async () => {
        // Seed a confirmed user before each login test
        await signup(BASE_USER)
    })

    it('200 — valid credentials return a JWT and user object', async () => {
        const res = await login({ email: BASE_USER.email, password: BASE_USER.password })
        expect(res.status).toBe(200)
        expect(res.body.token).toBeTruthy()
        expect(res.body.user.email).toBe(BASE_USER.email)
    })

    it('400 — missing email field returns 400', async () => {
        const res = await login({ password: BASE_USER.password })
        expect(res.status).toBe(400)
        expect(res.body.message).toBeTruthy()
    })

    it('400 — missing password field returns 400', async () => {
        const res = await login({ email: BASE_USER.email })
        expect(res.status).toBe(400)
        expect(res.body.message).toBeTruthy()
    })

    it('401 — wrong password returns 401', async () => {
        const res = await login({ email: BASE_USER.email, password: 'wrongpassword' })
        expect(res.status).toBe(401)
        expect(res.body.message).toBeTruthy()
    })

    it('401 — unknown email returns 401', async () => {
        const res = await login({ email: 'nobody@example.com', password: 'Password123' })
        expect(res.status).toBe(401)
        expect(res.body.message).toBeTruthy()
    })
})

// ─── /me (protected) ──────────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
    let token

    beforeEach(async () => {
        // Seed a user and capture their token
        const res = await signup(BASE_USER)
        token = res.body.token
    })

    it('200 — valid token returns the authenticated user', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.user).toBeDefined()
        expect(res.body.user.email).toBe(BASE_USER.email)
    })

    it('401 — missing Authorization header returns 401', async () => {
        const res = await request(app).get('/api/auth/me')
        expect(res.status).toBe(401)
        expect(res.body.message).toBeTruthy()
    })

    it('401 — invalid/tampered token returns 401', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer this.is.not.a.real.token')
        expect(res.status).toBe(401)
        expect(res.body.message).toBeTruthy()
    })
})

// ─── /config (public) ─────────────────────────────────────────────────────────

describe('GET /api/auth/config', () => {
    it('200 — returns the googleClientId field (may be null)', async () => {
        const res = await request(app).get('/api/auth/config')
        expect(res.status).toBe(200)
        // The field must exist; value may be null if GOOGLE_CLIENT_ID is not set in test env
        expect(Object.prototype.hasOwnProperty.call(res.body, 'googleClientId')).toBe(true)
    })
})
// ─── Email Confirmation ────────────────────────────────────────────────────────

describe('Email Confirmation Flow', () => {
    let originalEnv

    beforeAll(() => {
        originalEnv = process.env.SIGNUP_EMAIL_CONFIRMATION
        process.env.SIGNUP_EMAIL_CONFIRMATION = 'on'
    })

    afterAll(() => {
        process.env.SIGNUP_EMAIL_CONFIRMATION = originalEnv
    })

    beforeEach(() => {
        global.__LAST_SENT_CODE = null
    })

    it('POST /api/auth/signup stops at confirmation when enabled', async () => {
        const res = await signup(BASE_USER)
        expect(res.status).toBe(201)
        expect(res.body.verificationRequired).toBe(true)
        expect(res.body.codeSent).toBe(true)
        expect(global.__LAST_SENT_CODE).toBeTruthy()
    })

    it('POST /api/auth/login is blocked before verification', async () => {
        await signup(BASE_USER)
        const res = await login({ email: BASE_USER.email, password: BASE_USER.password })
        expect(res.status).toBe(403)
        expect(res.body.code).toBe('email_not_verified')
    })

    it('POST /api/auth/verify-email validates code and logs in user', async () => {
        await signup(BASE_USER)
        
        // 400 - missing code
        let res = await request(app).post('/api/auth/verify-email').send({ email: BASE_USER.email })
        expect(res.status).toBe(400)

        // 400 - invalid format
        res = await request(app).post('/api/auth/verify-email').send({ email: BASE_USER.email, code: '123' })
        expect(res.status).toBe(400)

        // 400 - mismatched code
        res = await request(app).post('/api/auth/verify-email').send({ email: BASE_USER.email, code: '000000' })
        expect(res.status).toBe(400)
        expect(res.body.code).toBe('mismatch')

        // 200 - valid code
        res = await request(app).post('/api/auth/verify-email').send({ email: BASE_USER.email, code: global.__LAST_SENT_CODE })
        expect(res.status).toBe(200)
        expect(res.body.token).toBeTruthy()

        // subsequent login should work
        const loginRes = await login({ email: BASE_USER.email, password: BASE_USER.password })
        expect(loginRes.status).toBe(200)
    })

    it('POST /api/auth/resend-verification resends code and respects cooldown', async () => {
        await signup(BASE_USER)
        const firstCode = global.__LAST_SENT_CODE
        global.__LAST_SENT_CODE = null

        // 429 - cooldown active
        let res = await request(app).post('/api/auth/resend-verification').send({ email: BASE_USER.email })
        expect(res.status).toBe(429)

        // bypass cooldown by updating DB
        await User.findOneAndUpdate(
            { email: BASE_USER.email },
            { $set: { 'emailVerification.sentAt': new Date('2000-01-01T00:00:00Z') } }
        )

        // 200 - resend succeeds
        res = await request(app).post('/api/auth/resend-verification').set('X-Forwarded-For', '1.2.3.4').send({ email: BASE_USER.email })
        expect(res.status).toBe(200)
        expect(res.body.codeSent).toBe(true)
        expect(global.__LAST_SENT_CODE).not.toBe(firstCode)
    })
})
