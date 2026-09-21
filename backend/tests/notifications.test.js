/**
 * Notifications endpoint tests — /api/notifications
 *
 * All behaviour verified against notificationsRoutes.js and Notification.js model.
 *
 * Routes:
 *   GET   /api/notifications       requireAuth — returns up to 20 notifications for req.user
 *   PATCH /api/notifications/read  requireAuth — marks all of req.user's notifications as read
 *
 * User isolation: the GET handler filters by { user: req.user._id }.
 * Notifications belonging to a different user are never returned.
 */

const request = require('supertest')
const app = require('../app')
const User = require('../models/User')
const Notification = require('../models/Notification')

// ─── Helpers ─────────────────────────────────────────────────────────────────

let _c = 0
const ue = () => `notif_${++_c}_${Date.now()}@example.com`

const signupUser = async (overrides = {}) => {
    const res = await request(app).post('/api/auth/signup').send({
        fullName: 'Notification Tester',
        email: ue(),
        password: 'Password123',
        companyName: 'NotifCo',
        ...overrides,
    })
    return { token: res.body.token, user: res.body.user }
}

const makeNotification = (userId, overrides = {}) =>
    Notification.create({
        user: userId,
        title: 'Test Notification',
        message: 'Something happened',
        type: 'task',
        read: false,
        ...overrides,
    })

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(async () => {
    await User.deleteMany({})
    await Notification.deleteMany({})
})

// ─── GET /api/notifications ───────────────────────────────────────────────────

describe('GET /api/notifications', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const res = await request(app).get('/api/notifications')
        expect(res.status).toBe(401)
    })

    it('200 — authenticated user receives an array', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(Array.isArray(res.body)).toBe(true)
    })

    it('200 — returns an empty array when the user has no notifications', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.length).toBe(0)
    })

    it('200 — returns notifications belonging to the authenticated user', async () => {
        const { token, user } = await signupUser()
        await makeNotification(user.id, { title: 'My notification' })

        const res = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.length).toBe(1)
        expect(res.body[0].title).toBe('My notification')
    })

    it('200 — user isolation: does NOT return another user\'s notifications', async () => {
        const userA = await signupUser()
        const userB = await signupUser()

        // Create a notification for User B
        await makeNotification(userB.user.id, { title: 'Only for B' })

        // User A requests their notifications — should be empty
        const res = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${userA.token}`)
        expect(res.status).toBe(200)
        expect(res.body.length).toBe(0)
    })

    it('200 — respects the 20-notification limit', async () => {
        const { token, user } = await signupUser()

        // Seed 25 notifications for this user
        const inserts = Array.from({ length: 25 }, (_, i) =>
            makeNotification(user.id, { title: `Notif ${i + 1}` })
        )
        await Promise.all(inserts)

        const res = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        // Route applies .limit(20)
        expect(res.body.length).toBeLessThanOrEqual(20)
    })

    it('200 — returned notifications have expected shape (title, message, type, read)', async () => {
        const { token, user } = await signupUser()
        await makeNotification(user.id, { title: 'Shape Test', message: 'Check me', type: 'reminder' })

        const res = await request(app)
            .get('/api/notifications')
            .set('Authorization', `Bearer ${token}`)
        const n = res.body[0]
        expect(n).toHaveProperty('title', 'Shape Test')
        expect(n).toHaveProperty('message', 'Check me')
        expect(n).toHaveProperty('type', 'reminder')
        expect(n).toHaveProperty('read', false)
    })
})

// ─── PATCH /api/notifications/read ───────────────────────────────────────────

describe('PATCH /api/notifications/read', () => {
    it('401 — unauthenticated request is rejected', async () => {
        const res = await request(app).patch('/api/notifications/read')
        expect(res.status).toBe(401)
    })

    it('200 — authenticated user receives success message', async () => {
        const { token } = await signupUser()
        const res = await request(app)
            .patch('/api/notifications/read')
            .set('Authorization', `Bearer ${token}`)
        expect(res.status).toBe(200)
        expect(res.body.message).toMatch(/marked as read/i)
    })

    it('200 — marks all of the user\'s unread notifications as read', async () => {
        const { token, user } = await signupUser()
        await makeNotification(user.id, { read: false })
        await makeNotification(user.id, { read: false })

        await request(app)
            .patch('/api/notifications/read')
            .set('Authorization', `Bearer ${token}`)

        const updated = await Notification.find({ user: user.id })
        expect(updated.every((n) => n.read === true)).toBe(true)
    })

    it('200 — only marks the requesting user\'s notifications (not another user\'s)', async () => {
        const userA = await signupUser()
        const userB = await signupUser()

        // B has an unread notification
        const bNotif = await makeNotification(userB.user.id, { read: false })

        // A calls /read — should only affect A's notifications (A has none here)
        await request(app)
            .patch('/api/notifications/read')
            .set('Authorization', `Bearer ${userA.token}`)

        // B's notification must still be unread
        const bNotifAfter = await Notification.findById(bNotif._id)
        expect(bNotifAfter.read).toBe(false)
    })
})
