/**
 * Settings Integration Tests
 */

const request = require('supertest')
const app = require('../app')
const User = require('../models/User')
const SystemSettings = require('../models/SystemSettings')
const RiskBenchmark = require('../models/RiskBenchmark')

const ADMIN_USER = {
    fullName: 'Admin User',
    email: 'admin@settings.test',
    password: 'Password123',
    companyName: 'Settings Co',
    role: 'Admin',
}

const REGULAR_USER = {
    fullName: 'Regular User',
    email: 'regular@settings.test',
    password: 'Password123',
    companyName: 'Settings Co',
    role: 'User',
}

const OTHER_COMPANY_USER = {
    fullName: 'Other User',
    email: 'other@other.test',
    password: 'Password123',
    companyName: 'Other Co',
    role: 'User',
}

beforeEach(async () => {
    await User.deleteMany({})
    await SystemSettings.deleteMany({})
    await RiskBenchmark.deleteMany({})
})

describe('Settings Routes (routes/settingsRoutes.js)', () => {
    let adminToken, regularToken, otherToken

    beforeEach(async () => {
        const adminRes = await request(app).post('/api/auth/signup').send(ADMIN_USER)
        adminToken = adminRes.body.token
        await User.updateOne({ email: ADMIN_USER.email }, { role: 'Admin' })

        const regularRes = await request(app).post('/api/auth/signup').send(REGULAR_USER)
        regularToken = regularRes.body.token

        const otherRes = await request(app).post('/api/auth/signup').send(OTHER_COMPANY_USER)
        otherToken = otherRes.body.token
    })

    it('GET /api/settings - 401 unauthenticated', async () => {
        const res = await request(app).get('/api/settings')
        expect(res.status).toBe(401)
    })

    it('GET /api/settings - 200 regular user retrieves company settings', async () => {
        const res = await request(app)
            .get('/api/settings')
            .set('Authorization', `Bearer ${regularToken}`)
        
        expect(res.status).toBe(200)
        expect(res.body.settings.companyName).toBe('Settings Co')
    })

    it('PUT /api/settings - 403 regular user rejected', async () => {
        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${regularToken}`)
            .send({ timezone: 'UTC', currency: 'USD', language: 'en-US' })
        
        expect(res.status).toBe(403)
    })

    it('PUT /api/settings - 200 Admin can update settings', async () => {
        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ timezone: 'Australia/Sydney', currency: 'AUD', language: 'en-AU' })
        
        expect(res.status).toBe(200)
        expect(res.body.settings.timezone).toBe('Australia/Sydney')
        expect(res.body.settings.currency).toBe('AUD')
        expect(res.body.settings.language).toBe('en-AU')
    })

    it('PUT /api/settings - 409 blocks renaming to an already existing company', async () => {
        // Attempt to rename "Settings Co" to "Other Co"
        const res = await request(app)
            .put('/api/settings')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ companyName: 'Other Co' })
        
        expect(res.status).toBe(409)
        expect(res.body.message).toMatch(/already uses this name/i)
    })
})
