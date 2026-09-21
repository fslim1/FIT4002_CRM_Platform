/**
 * Customer endpoint tests — /api/customers
 *
 * Behaviours verified against customerController.js and the Customer model:
 *
 *  GET /api/customers
 *    - 401  no auth token
 *    - 200  authenticated user sees an array (empty when no records exist)
 *
 *  POST /api/customers
 *    - 401  no auth token
 *    - 400  missing required fields (controller checks: fullName, phone, email,
 *            company, address, designation, department)
 *    - 201  all required fields provided: creates customer, returns document
 *
 *  GET /api/customers/:id
 *    - 200  owner can fetch their own customer
 *    - 403  a different user (same company) without viewAllData cannot access
 *            another user's customer (canViewCustomer logic)
 *    - 404  non-existent ID returns 404
 *
 * Note: multipart/form-data (file upload) is NOT tested here because it
 * requires a real multer setup that is complex to replicate in an API/integration test.
 * That remains a gap for a future test.
 */

const request = require('supertest')
const app = require('../app')
const User = require('../models/User')
const Customer = require('../models/Customer')

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_CUSTOMER = {
    fullName: 'Acme Corp',
    phone: '0412345678',
    email: 'acme@example.com',
    company: 'Acme Corp',
    address: '123 Test St',
    designation: 'CTO',
    department: 'Engineering',
}

/** Sign up a fresh user and return their JWT token */
const signupAndLogin = async (seed = {}) => {
    const userData = {
        fullName: 'Customer Tester',
        email: `tester_${Date.now()}@example.com`,
        password: 'Password123',
        companyName: 'Test Co',
        ...seed,
    }
    const res = await request(app).post('/api/auth/signup').send(userData)
    return { token: res.body.token, user: res.body.user }
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await User.deleteMany({})
    await Customer.deleteMany({})
})

// ─── GET /api/customers ────────────────────────────────────────────────────────

describe('GET /api/customers', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const res = await request(app).get('/api/customers')
        expect(res.status).toBe(401)
    })

    it('200 — authenticated user gets an array (empty when none exist)', async () => {
        const { token } = await signupAndLogin()
        const res = await request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    it('200 — authenticated user sees their own created customers', async () => {
        const { token, user } = await signupAndLogin()

        // Seed a customer owned by this user directly in DB (bypassing file upload middleware)
        await Customer.create({ ...VALID_CUSTOMER, owner: user.id })

        const res = await request(app)
            .get('/api/customers')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.length).toBeGreaterThanOrEqual(1)
    })
})

// ─── POST /api/customers ───────────────────────────────────────────────────────

describe('POST /api/customers', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const res = await request(app).post('/api/customers').send(VALID_CUSTOMER)
        expect(res.status).toBe(401)
    })

    it('400 — missing fullName returns 400 with a message', async () => {
        const { token } = await signupAndLogin()
        const { fullName, ...body } = VALID_CUSTOMER
        const res = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${token}`)
            .send(body)
        expect(res.status).toBe(400)
        expect(res.body.message).toBeTruthy()
    })

    it('400 — missing phone returns 400', async () => {
        const { token } = await signupAndLogin()
        const { phone, ...body } = VALID_CUSTOMER
        const res = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${token}`)
            .send(body)
        expect(res.status).toBe(400)
    })

    it('400 — missing address returns 400', async () => {
        const { token } = await signupAndLogin()
        const { address, ...body } = VALID_CUSTOMER
        const res = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${token}`)
            .send(body)
        expect(res.status).toBe(400)
    })

    it('201 — all required fields creates the customer and returns it', async () => {
        const { token } = await signupAndLogin()
        const res = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_CUSTOMER)
        expect(res.status).toBe(201)
        expect(res.body._id).toBeDefined()
        expect(res.body.fullName).toBe(VALID_CUSTOMER.fullName)
        expect(res.body.email).toBe(VALID_CUSTOMER.email)
    })
})

// ─── GET /api/customers/:id ────────────────────────────────────────────────────

describe('GET /api/customers/:id', () => {
    it('404 — non-existent MongoDB ID returns 404', async () => {
        const { token } = await signupAndLogin()
        const fakeId = '507f1f77bcf86cd799439011'
        const res = await request(app)
            .get(`/api/customers/${fakeId}`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
    })

    it('200 — owner can fetch their own customer by ID', async () => {
        const { token, user } = await signupAndLogin()
        // Create via API so the owner is set correctly
        const createRes = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${token}`)
            .send(VALID_CUSTOMER)
        const customerId = createRes.body._id

        const res = await request(app)
            .get(`/api/customers/${customerId}`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body._id).toBe(customerId)
    })

    it('403 — a different user in the same company cannot see another user\'s customer', async () => {
        // User A creates a customer
        const userA = await signupAndLogin({ email: 'usera@example.com', companyName: 'Shared Co' })
        const createRes = await request(app)
            .post('/api/customers')
            .set('Authorization', `Bearer ${userA.token}`)
            .send(VALID_CUSTOMER)
        const customerId = createRes.body._id

        // User B: different user, same company, no viewAllData permission
        const userB = await signupAndLogin({ email: 'userb@example.com', companyName: 'Shared Co' })
        const res = await request(app)
            .get(`/api/customers/${customerId}`)
            .set('Authorization', `Bearer ${userB.token}`)
        // canViewCustomer returns false → controller sends 403
        expect(res.status).toBe(403)
    })
})
