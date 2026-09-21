/**
 * Interaction endpoint tests — /api/interactions
 *
 * All behaviour verified against interactionController.js and Interaction.js model.
 *
 * ── CRITICAL FINDING ─────────────────────────────────────────────────────────
 *
 *  Interaction schema (models/Interaction.js) declares:
 *    time: { type: String, required: true }
 *
 *  createInteraction (controllers/interactionController.js line 39) constructs:
 *    new Interaction({ entityId: customerId, type, desc: details, author: authorName })
 *
 *  The `time` field is NEVER set from req.body or anywhere else.
 *  Result: every call to POST /api/interactions/create fails Mongoose validation
 *  and the catch block returns 400.
 *
 *  This test suite documents this real behaviour.  NO fake 201 happy-path is
 *  asserted because the controller does not support one with the current schema.
 *
 * ── AUTH NOTES ───────────────────────────────────────────────────────────────
 *
 *  Route file (interactionRoutes.js):
 *    GET  /:customerId        — NO requireAuth guard (public)
 *    POST /create             — NO requireAuth guard (public)
 *    DELETE /:interactionId   — requireAuth, requirePermission('deleteRecords')
 *    PUT  /:interactionId     — NO requireAuth guard (public)
 *
 *  Tests document current behaviour; production code is NOT modified.
 */

const request = require('supertest')
const mongoose = require('mongoose')
const app = require('../app')
const User = require('../models/User')
const Interaction = require('../models/Interaction')

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _c = 0
const ue = () => `inter_${++_c}_${Date.now()}@example.com`

const signupUser = async (overrides = {}) => {
    const res = await request(app).post('/api/auth/signup').send({
        fullName: 'Interaction Tester',
        email: ue(),
        password: 'password123',
        companyName: 'InterCo',
        ...overrides,
    })
    return { token: res.body.token, user: res.body.user }
}

/** Promote a user's role directly in DB (signup always creates 'User'). */
const promoteToAdmin = async (userId) => {
    await User.findByIdAndUpdate(userId, { role: 'Admin' })
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await User.deleteMany({})
    await Interaction.deleteMany({})
})

// ─── GET /api/interactions/:customerId ───────────────────────────────────────

describe('GET /api/interactions/:customerId', () => {
    it('200 — public route returns an array for any entityId (no auth required)', async () => {
        const res = await request(app).get('/api/interactions/some-customer-id')
        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    it('200 — returns only interactions belonging to that entityId', async () => {
        // Seed two interactions for different entity IDs directly in the DB
        await Interaction.create({ entityId: 'cust-aaa', type: 'Call', desc: 'Hello', author: 'A', time: '10:00' })
        await Interaction.create({ entityId: 'cust-bbb', type: 'Email', desc: 'Hi', author: 'B', time: '11:00' })

        const res = await request(app).get('/api/interactions/cust-aaa')
        expect(res.status).toBe(200)
        expect(res.body.length).toBe(1)
        expect(res.body[0].entityId).toBe('cust-aaa')
    })

    it('200 — returns an empty array when no interactions match', async () => {
        const res = await request(app).get('/api/interactions/no-such-customer')
        expect(res.status).toBe(200)
        expect(res.body).toEqual([])
    })
})

// ─── POST /api/interactions/create ───────────────────────────────────────────

describe('POST /api/interactions/create', () => {
    /**
     * The controller builds: new Interaction({ entityId, type, desc, author })
     * The schema requires `time`.  Because `time` is never set, Mongoose
     * validation always fails → 400.  This is the actual current behaviour.
     */
    it('400 — always fails because controller never sets the required `time` field', async () => {
        const res = await request(app)
            .post('/api/interactions/create')
            .send({
                type: 'Call',
                details: 'Discussed project timeline',
                // time is intentionally NOT sent — the controller doesn't read it anyway
            })
        // Mongoose validation error caught by catch → 400
        expect(res.status).toBe(400)
        expect(res.body.error).toBeTruthy()
    })

    it('400 — even a fully populated body fails because `time` is hardcoded out of the constructor', async () => {
        const res = await request(app)
            .post('/api/interactions/create')
            .send({
                type: 'Email',
                details: 'Sent a follow-up',
                time: '12:00',     // provided in body, but controller ignores req.body.time
                companyName: 'Acme',
            })
        // Controller ignores req.body.time; Interaction document misses required time
        expect(res.status).toBe(400)
    })

    it('400 — missing `type` field produces a validation/controller error', async () => {
        const res = await request(app)
            .post('/api/interactions/create')
            .send({ details: 'No type provided' })
        expect(res.status).toBe(400)
    })
})

// ─── DELETE /api/interactions/:interactionId ─────────────────────────────────

describe('DELETE /api/interactions/:interactionId', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const fakeId = new mongoose.Types.ObjectId().toString()
        const res = await request(app).delete(`/api/interactions/${fakeId}`)
        expect(res.status).toBe(401)
    })

    it('403 — authenticated regular User without deleteRecords permission is rejected', async () => {
        const { token } = await signupUser()
        const fakeId = new mongoose.Types.ObjectId().toString()
        const res = await request(app)
            .delete(`/api/interactions/${fakeId}`)
            .set('Authorization', `Bearer ${token}`)
        // requirePermission('deleteRecords'): regular User has deleteRecords=false → 403
        expect(res.status).toBe(403)
    })

    it('400 — Admin with deleteRecords: invalid ObjectId format returns 400', async () => {
        const { token, user } = await signupUser()
        await promoteToAdmin(user.id)

        const res = await request(app)
            .delete('/api/interactions/not-a-valid-id')
            .set('Authorization', `Bearer ${token}`)
        // Controller checks mongoose.Types.ObjectId.isValid → 400
        expect(res.status).toBe(400)
        expect(res.body.message).toMatch(/invalid interaction id/i)
    })

    it('404 — Admin with deleteRecords: valid ObjectId but not found returns 404', async () => {
        const { token, user } = await signupUser()
        await promoteToAdmin(user.id)

        const nonExistentId = new mongoose.Types.ObjectId().toString()
        const res = await request(app)
            .delete(`/api/interactions/${nonExistentId}`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(404)
        expect(res.body.message).toMatch(/not found/i)
    })

    it('200 — Admin can delete an existing interaction', async () => {
        const { token, user } = await signupUser()
        await promoteToAdmin(user.id)

        // Seed directly (bypassing the broken POST /create route)
        const interaction = await Interaction.create({
            entityId: 'cust-xyz',
            type: 'Call',
            desc: 'Follow up',
            author: 'Tester',
            time: '09:00',
        })

        const res = await request(app)
            .delete(`/api/interactions/${interaction._id}`)
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.status).toBe('success')
    })
})

// ─── PUT /api/interactions/:interactionId ────────────────────────────────────

describe('PUT /api/interactions/:interactionId', () => {
    it('404 — updating a non-existent interaction returns 404', async () => {
        const nonExistentId = new mongoose.Types.ObjectId().toString()
        const res = await request(app)
            .put(`/api/interactions/${nonExistentId}`)
            .send({ type: 'Email', desc: 'Updated desc' })
        expect(res.status).toBe(404)
        expect(res.body.message).toMatch(/not found/i)
    })

    it('200 — existing interaction can be updated (public route, no auth required)', async () => {
        const interaction = await Interaction.create({
            entityId: 'cust-put-test',
            type: 'Call',
            desc: 'Original',
            author: 'Tester',
            time: '08:00',
        })

        const res = await request(app)
            .put(`/api/interactions/${interaction._id}`)
            .send({ type: 'Email', desc: 'Updated' })
        expect(res.status).toBe(200)
        expect(res.body.data.desc).toBe('Updated')
        expect(res.body.data.type).toBe('Email')
    })
})
