/**
 * Dashboard endpoint tests — GET /api/dashboard
 *
 * All behaviour verified against dashboardController.js and dashboardRoutes.js.
 *
 * Route: GET /api/dashboard — requireAuth
 *
 * The controller returns a large object with these top-level keys:
 *   membersList, totalSales, dealsCompleted, ongoingDeals, avgDealValue,
 *   salesTrends, pipeline, activitySummary, recentActivities, teamPerformance
 *
 * Tests focus on:
 *   1. Authentication guard
 *   2. Response shape (all expected keys present)
 *   3. Supported timeFilter query values
 *   4. Custom date range
 *   5. Numeric KPI wrapper shape (value + changePercent + showChange)
 *   6. Empty-data graceful handling (no crashes with no deals/customers)
 *
 * Numeric KPI values are NOT hardcoded — we only assert types and shapes
 * to avoid brittle tests that break when data changes.
 */

const request = require('supertest')
const app = require('../app')
const User = require('../models/User')
const Deal = require('../models/Deal')
const Customer = require('../models/Customer')

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _c = 0
const ue = () => `dash_${++_c}_${Date.now()}@example.com`

const signupUser = async (overrides = {}) => {
    const res = await request(app).post('/api/auth/signup').send({
        fullName: 'Dashboard Tester',
        email: ue(),
        password: 'Password123',
        companyName: 'DashCo',
        ...overrides,
    })
    return { token: res.body.token, user: res.body.user }
}

/** Assert the top-level response keys that the controller always returns. */
const expectDashboardShape = (body) => {
    expect(body).toHaveProperty('membersList')
    expect(body).toHaveProperty('totalSales')
    expect(body).toHaveProperty('dealsCompleted')
    expect(body).toHaveProperty('ongoingDeals')
    expect(body).toHaveProperty('avgDealValue')
    expect(body).toHaveProperty('salesTrends')
    expect(body).toHaveProperty('pipeline')
    expect(body).toHaveProperty('activitySummary')
    expect(body).toHaveProperty('recentActivities')
    expect(body).toHaveProperty('teamPerformance')
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await User.deleteMany({})
    await Deal.deleteMany({})
    await Customer.deleteMany({})
})

// ─── Authentication guard ─────────────────────────────────────────────────────

describe('GET /api/dashboard — authentication', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const res = await request(app).get('/api/dashboard')
        expect(res.status).toBe(401)
    })
})

// ─── Response shape ────────────────────────────────────────────────────────────

describe('GET /api/dashboard — response shape', () => {
    it('200 — returns all expected top-level keys with an empty database', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expectDashboardShape(res.body)
    })

    it('200 — KPI wrappers (totalSales, dealsCompleted, ongoingDeals, avgDealValue) have value/showChange fields', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        for (const key of ['totalSales', 'dealsCompleted', 'ongoingDeals', 'avgDealValue']) {
            expect(typeof res.body[key].value, `${key}.value`).toBe('number')
            expect(typeof res.body[key].showChange, `${key}.showChange`).toBe('boolean')
        }
    })

    it('200 — pipeline object contains completedDeals, ongoingDeals, lostDeals, stages array', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${token}`)
        const { pipeline } = res.body
        expect(pipeline).toHaveProperty('completedDeals')
        expect(pipeline).toHaveProperty('ongoingDeals')
        expect(pipeline).toHaveProperty('lostDeals')
        expect(pipeline).toHaveProperty('stages')
        expect(Array.isArray(pipeline.stages)).toBe(true)
    })

    it('200 — activitySummary contains callsMade, meetingsHeld, emailsSent, dealsClosed', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${token}`)
        const { activitySummary } = res.body
        expect(activitySummary).toHaveProperty('callsMade')
        expect(activitySummary).toHaveProperty('meetingsHeld')
        expect(activitySummary).toHaveProperty('emailsSent')
        expect(activitySummary).toHaveProperty('dealsClosed')
    })

    it('200 — teamPerformance contains topMember and members array', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${token}`)
        const { teamPerformance } = res.body
        expect(teamPerformance).toHaveProperty('topMember')
        expect(teamPerformance).toHaveProperty('members')
        expect(Array.isArray(teamPerformance.members)).toBe(true)
    })

    it('200 — membersList is an array', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${token}`)
        expect(Array.isArray(res.body.membersList)).toBe(true)
    })

    it('200 — salesTrends is an array', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${token}`)
        expect(Array.isArray(res.body.salesTrends)).toBe(true)
    })

    it('200 — recentActivities is an array', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/dashboard')
            .set('Authorization', `Bearer ${token}`)
        expect(Array.isArray(res.body.recentActivities)).toBe(true)
    })
})

// ─── timeFilter query param ────────────────────────────────────────────────────

describe('GET /api/dashboard — timeFilter variants', () => {
    const FILTERS = ['today', 'thisWeek', 'thisMonth', 'thisYear']

    for (const filter of FILTERS) {
        it(`200 — ?timeFilter=${filter} responds without error`, async () => {
            const { token } = await signupUser()
            const res = await request(app)
                .get(`/api/dashboard?timeFilter=${filter}`)
                .set('Authorization', `Bearer ${token}`)
            expect(res.status).toBe(200)
            expectDashboardShape(res.body)
        })
    }

    it('200 — ?timeFilter=custom with valid date range responds without error', async () => {
        const { token } = await signupUser()
        const start = new Date()
        start.setDate(start.getDate() - 30)
        const end = new Date()

        const res = await request(app)
            .get(`/api/dashboard?timeFilter=custom&startDate=${start.toISOString()}&endDate=${end.toISOString()}`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expectDashboardShape(res.body)
    })
})

// ─── showChange flag behaviour ─────────────────────────────────────────────────

describe('GET /api/dashboard — showChange flag', () => {
    it('showChange is true for thisMonth (controller computes a previous period)', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/dashboard?timeFilter=thisMonth')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        // showChange=true for thisMonth (controller sets showChange for today/thisWeek/thisMonth/thisYear)
        expect(res.body.totalSales.showChange).toBe(true)
    })
})
