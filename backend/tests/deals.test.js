/**
 * Deal endpoint tests — /api/deals
 *
 * All behaviour verified against dealRoutes.js, teamScope.js, and permissions.js.
 *
 * Route summary:
 *   GET    /api/deals              requireAuth
 *   GET    /api/deals/logs         requireAuth
 *   POST   /api/deals              requireAuth, requireRole('User', 'Admin')
 *   PATCH  /api/deals/:id/stage    requireAuth
 *   PATCH  /api/deals/:id/outcome  requireAuth
 *   PATCH  /api/deals/:id/probability requireAuth
 *   DELETE /api/deals/:id          requireAuth, requirePermission('deleteRecords')
 *
 * Permission notes (from permissions.js):
 *   hasPermission: if user.role === 'Admin' → always true (any permission key).
 *   Regular User with permissions.deleteRecords === false → 403.
 *
 * Role notes (from dealRoutes.js line 114):
 *   POST /api/deals requires requireRole('User', 'Admin').
 *   'Supervisor' is NOT listed → 403 for Supervisors on POST.
 */

const request = require('supertest')
const app = require('../app')
const User = require('../models/User')
const Deal = require('../models/Deal')
const DealLog = require('../models/DealLog')

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _counter = 0
const uniqueEmail = (prefix = 'deal') => `${prefix}_${++_counter}_${Date.now()}@example.com`

/**
 * Sign up a user with the given overrides and return { token, user }.
 * Roles other than 'User' (the signup default) must be patched in DB after creation.
 */
const signupUser = async (overrides = {}) => {
    const body = {
        fullName: 'Deal Tester',
        email: uniqueEmail(),
        password: 'password123',
        companyName: 'DealCo',
        ...overrides,
    }
    const res = await request(app).post('/api/auth/signup').send(body)
    return { token: res.body.token, user: res.body.user, status: res.status }
}

/** Sign up, then force a role in MongoDB (signup always creates 'User'). */
const signupAs = async (role, extraPermissions = {}) => {
    const { token, user } = await signupUser()
    await User.findByIdAndUpdate(user.id, { role, permissions: extraPermissions })
    // Re-login to get a fresh token that still works (JWT stores only userId, not role)
    return { token, userId: user.id }
}

/** POST a valid deal via the API and return the created deal body. */
const createDeal = async (token, overrides = {}) => {
    const body = {
        name: 'Test Deal',
        company: 'Acme',
        price: '5000',
        ...overrides,
    }
    return request(app)
        .post('/api/deals')
        .set('Authorization', `Bearer ${token}`)
        .send(body)
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await User.deleteMany({})
    await Deal.deleteMany({})
    await DealLog.deleteMany({})
})

// ─── GET /api/deals ───────────────────────────────────────────────────────────

describe('GET /api/deals', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const res = await request(app).get('/api/deals')
        expect(res.status).toBe(401)
    })

    it('200 — authenticated user receives an array', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/deals')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    it('200 — user only sees their own deals by default', async () => {
        const userA = await signupUser({ email: uniqueEmail('a'), companyName: 'DealCo' })
        const userB = await signupUser({ email: uniqueEmail('b'), companyName: 'DealCo' })

        // A creates a deal
        await createDeal(userA.token)

        // B should see 0 deals (not A's)
        const res = await request(app)
            .get('/api/deals')
            .set('Authorization', `Bearer ${userB.token}`)
        expect(res.status).toBe(200)
        expect(res.body.length).toBe(0)
    })
})

// ─── GET /api/deals/logs ──────────────────────────────────────────────────────

describe('GET /api/deals/logs', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const res = await request(app).get('/api/deals/logs')
        expect(res.status).toBe(401)
    })

    it('200 — authenticated user receives an array', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/deals/logs')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })
})

// ─── POST /api/deals ─────────────────────────────────────────────────────────

describe('POST /api/deals', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const res = await request(app)
            .post('/api/deals')
            .send({ name: 'X', company: 'Y', price: '100' })
        expect(res.status).toBe(401)
    })

    it('201 — authenticated User creates a deal; stage defaults to Qualified', async () => {
        const { token } = await signupUser()
        const res = await createDeal(token)
        expect(res.status).toBe(201)
        expect(res.body._id).toBeDefined()
        expect(res.body.name).toBe('Test Deal')
        expect(res.body.stage).toBe('Qualified')
    })

    it('400 — non-existent assignee name returns 400', async () => {
        const { token } = await signupUser()
        const res = await createDeal(token, { assignee: 'Nobody Exists AtAll' })
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/assignee/i)
    })

    it('403 — Supervisor role is rejected by requireRole (not in allowed list)', async () => {
        const { token } = await signupAs('Supervisor')
        const res = await createDeal(token)
        // requireRole('User', 'Admin') — Supervisor is not included
        expect(res.status).toBe(403)
    })
})

// ─── PATCH /api/deals/:id/stage ──────────────────────────────────────────────

describe('PATCH /api/deals/:id/stage', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const res = await request(app)
            .patch('/api/deals/507f1f77bcf86cd799439011/stage')
            .send({ stage: 'Contact Made' })
        expect(res.status).toBe(401)
    })

    it('404 — non-existent deal ID returns 404', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .patch('/api/deals/507f1f77bcf86cd799439011/stage')
            .set('Authorization', `Bearer ${token}`)
            .send({ stage: 'Contact Made' })
        expect(res.status).toBe(404)
    })

    it('403 — different user cannot advance another user\'s deal', async () => {
        const userA = await signupUser({ email: uniqueEmail('a'), companyName: 'DealCo' })
        const userB = await signupUser({ email: uniqueEmail('b'), companyName: 'DealCo' })

        const createRes = await createDeal(userA.token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/stage`)
            .set('Authorization', `Bearer ${userB.token}`)
            .send({ stage: 'Contact Made' })
        expect(res.status).toBe(403)
    })

    it('200 — owner can advance deal to a valid forward stage', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/stage`)
            .set('Authorization', `Bearer ${token}`)
            .send({ stage: 'Contact Made' })
        expect(res.status).toBe(200)
        expect(res.body.stage).toBe('Contact Made')
    })

    it('400 — invalid stage name is rejected', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/stage`)
            .set('Authorization', `Bearer ${token}`)
            .send({ stage: 'NonExistentStage' })
        expect(res.status).toBe(400)
    })

    it('400 — backward stage transition is not allowed', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        // Advance to 'Contact Made' first
        await request(app)
            .patch(`/api/deals/${dealId}/stage`)
            .set('Authorization', `Bearer ${token}`)
            .send({ stage: 'Contact Made' })

        // Try to move back to 'Qualified'
        const res = await request(app)
            .patch(`/api/deals/${dealId}/stage`)
            .set('Authorization', `Bearer ${token}`)
            .send({ stage: 'Qualified' })
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/not allowed/i)
    })

    it('400 — cannot set Won/Lost via /stage endpoint (must use /outcome)', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/stage`)
            .set('Authorization', `Bearer ${token}`)
            .send({ stage: 'Won' })
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/outcome/i)
    })
})

// ─── PATCH /api/deals/:id/outcome ────────────────────────────────────────────

describe('PATCH /api/deals/:id/outcome', () => {
    it('400 — outcome must be Won or Lost', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/outcome`)
            .set('Authorization', `Bearer ${token}`)
            .send({ outcome: 'Maybe' })
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/Won or Lost/i)
    })

    it('200 — owner can mark deal as Won', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/outcome`)
            .set('Authorization', `Bearer ${token}`)
            .send({ outcome: 'Won' })
        expect(res.status).toBe(200)
        expect(res.body.stage).toBe('Won')
    })

    it('200 — owner can mark deal as Lost', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/outcome`)
            .set('Authorization', `Bearer ${token}`)
            .send({ outcome: 'Lost' })
        expect(res.status).toBe(200)
        expect(res.body.stage).toBe('Lost')
    })

    it('400 — deal already finalised cannot be updated again', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        // First mark as Won
        await request(app)
            .patch(`/api/deals/${dealId}/outcome`)
            .set('Authorization', `Bearer ${token}`)
            .send({ outcome: 'Won' })

        // Second attempt should fail
        const res = await request(app)
            .patch(`/api/deals/${dealId}/outcome`)
            .set('Authorization', `Bearer ${token}`)
            .send({ outcome: 'Lost' })
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/finalised/i)
    })

    it('403 — different user cannot mark another user\'s deal as Won', async () => {
        const userA = await signupUser({ email: uniqueEmail('a'), companyName: 'DealCo' })
        const userB = await signupUser({ email: uniqueEmail('b'), companyName: 'DealCo' })

        const createRes = await createDeal(userA.token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/outcome`)
            .set('Authorization', `Bearer ${userB.token}`)
            .send({ outcome: 'Won' })
        expect(res.status).toBe(403)
    })
})

// ─── PATCH /api/deals/:id/probability ────────────────────────────────────────

describe('PATCH /api/deals/:id/probability', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const res = await request(app)
            .patch('/api/deals/507f1f77bcf86cd799439011/probability')
            .send({ probability: 50 })
        expect(res.status).toBe(401)
    })

    it('400 — probability below 0 is rejected', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/probability`)
            .set('Authorization', `Bearer ${token}`)
            .send({ probability: -1 })
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/0 and 100/i)
    })

    it('400 — probability above 100 is rejected', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/probability`)
            .set('Authorization', `Bearer ${token}`)
            .send({ probability: 101 })
        expect(res.status).toBe(400)
    })

    it('400 — non-numeric probability is rejected', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/probability`)
            .set('Authorization', `Bearer ${token}`)
            .send({ probability: 'high' })
        expect(res.status).toBe(400)
    })

    it('200 — valid probability update is accepted', async () => {
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .patch(`/api/deals/${dealId}/probability`)
            .set('Authorization', `Bearer ${token}`)
            .send({ probability: 75 })
        expect(res.status).toBe(200)
        expect(res.body.probability).toBe(75)
    })

    it('404 — non-existent deal ID returns 404', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .patch('/api/deals/507f1f77bcf86cd799439011/probability')
            .set('Authorization', `Bearer ${token}`)
            .send({ probability: 50 })
        expect(res.status).toBe(404)
    })
})

// ─── DELETE /api/deals/:id ────────────────────────────────────────────────────

describe('DELETE /api/deals/:id', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const res = await request(app).delete('/api/deals/507f1f77bcf86cd799439011')
        expect(res.status).toBe(401)
    })

    it('403 — regular User without deleteRecords permission is rejected', async () => {
        // Regular User (no deleteRecords) tries to delete their own deal
        const { token } = await signupUser()
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .delete(`/api/deals/${dealId}`)
            .set('Authorization', `Bearer ${token}`)
        // requirePermission('deleteRecords'): regular User has deleteRecords=false → 403
        expect(res.status).toBe(403)
    })

    it('200 — Admin can delete their own deal (Admin implicitly holds deleteRecords)', async () => {
        // Confirmed in permissions.js line 12: if user.role === 'Admin' return true
        const { token } = await signupAs('Admin')
        const createRes = await createDeal(token)
        const dealId = createRes.body._id

        const res = await request(app)
            .delete(`/api/deals/${dealId}`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.message).toMatch(/deleted/i)
    })

    it('404 — Admin trying to delete a non-existent deal returns 404', async () => {
        const { token } = await signupAs('Admin')
        const res = await request(app)
            .delete('/api/deals/507f1f77bcf86cd799439011')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
    })

    it('403 — Admin cannot delete a deal they do not have access to (different company)', async () => {
        // User from CompanyA creates a deal
        const userA = await signupUser({ email: uniqueEmail('compA'), companyName: 'CompanyA' })
        const createRes = await createDeal(userA.token)
        const dealId = createRes.body._id

        // Admin from CompanyB (signupAs defaults to 'DealCo', different from 'CompanyA')
        const { token: adminBToken } = await signupAs('Admin')

        const res = await request(app)
            .delete(`/api/deals/${dealId}`)
            .set('Authorization', `Bearer ${adminBToken}`)
        // canAccessDeal checks company scope → 403
        expect(res.status).toBe(403)
    })
})
