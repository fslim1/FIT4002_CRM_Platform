/**
 * Risk Assessment Tests
 */

const request = require('supertest')
const app = require('../app')
const User = require('../models/User')
const Customer = require('../models/Customer')
const Task = require('../models/Task')
const RiskBenchmark = require('../models/RiskBenchmark')
const { getDaysInStage, getDaysSinceActivity, getOverdueTaskCount } = require('../services/riskFactors')
const mongoose = require('mongoose')

const ADMIN_USER = {
    fullName: 'Admin User',
    email: 'admin@example.com',
    password: 'Password123',
    companyName: 'Test Co',
    role: 'Admin',
}

const REGULAR_USER = {
    fullName: 'Regular User',
    email: 'regular@example.com',
    password: 'Password123',
    companyName: 'Test Co',
    role: 'User',
}

beforeEach(async () => {
    await User.deleteMany({})
    await Customer.deleteMany({})
    await Task.deleteMany({})
    await RiskBenchmark.deleteMany({})
})

describe('Risk Factors Unit Tests (services/riskFactors.js)', () => {
    it('getDaysInStage calculates days correctly', () => {
        const now = Date.now()
        const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000)
        expect(getDaysInStage({ stageEnteredDate: threeDaysAgo })).toBe(3)
        expect(getDaysInStage({})).toBe(0)
    })

    it('getDaysSinceActivity looks up customer interactions correctly', async () => {
        // No customer
        const noCustomer = await getDaysSinceActivity({ customer: null })
        expect(noCustomer).toEqual({ days: null, neverContacted: true })

        // Customer with no interactions
        await Customer.create({ fullName: 'John Doe', interactions: [], phone: '1', email: 'j@d.com', company: 'A', address: 'B', designation: 'C', department: 'D' })
        const noInteractions = await getDaysSinceActivity({ customer: 'John Doe' })
        expect(noInteractions).toEqual({ days: null, neverContacted: true })

        // Customer with interactions
        const now = Date.now()
        const twoDaysAgo = new Date(now - 2 * 24 * 60 * 60 * 1000)
        await Customer.updateOne(
            { fullName: 'John Doe' },
            { $push: { interactions: { date: twoDaysAgo, notes: 'Called' } } }
        )
        const hasActivity = await getDaysSinceActivity({ customer: 'John Doe' })
        expect(hasActivity).toEqual({ days: 2, neverContacted: false })
    })

    it('getOverdueTaskCount counts uncompleted past-due tasks', async () => {
        const dealId = new mongoose.Types.ObjectId()
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000)
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)

        // 1 overdue
        await Task.create({ title: 'Task 1', dueDate: yesterday, status: 'todo', deal: dealId, createdBy: new mongoose.Types.ObjectId() })
        // 1 completed (should be ignored)
        await Task.create({ title: 'Task 2', dueDate: yesterday, status: 'completed', deal: dealId, createdBy: new mongoose.Types.ObjectId() })
        // 1 future (should be ignored)
        await Task.create({ title: 'Task 3', dueDate: tomorrow, status: 'todo', deal: dealId, createdBy: new mongoose.Types.ObjectId() })
        // 1 on another deal
        await Task.create({ title: 'Task 4', dueDate: yesterday, status: 'todo', deal: new mongoose.Types.ObjectId(), createdBy: new mongoose.Types.ObjectId() })

        const count = await getOverdueTaskCount(dealId)
        expect(count).toBe(1)
    })
})

describe('Risk Benchmarks Integration Tests (routes/riskBenchmarkRoutes.js)', () => {
    let adminToken, regularToken

    beforeEach(async () => {
        const adminRes = await request(app).post('/api/auth/signup').send(ADMIN_USER)
        adminToken = adminRes.body.token
        await User.updateOne({ email: ADMIN_USER.email }, { role: 'Admin' })

        const regularRes = await request(app).post('/api/auth/signup').send(REGULAR_USER)
        regularToken = regularRes.body.token
    })

    it('GET /api/risk-benchmarks - authenticated users can read', async () => {
        await RiskBenchmark.create({
            companyKey: 'test co',
            companyName: 'Test Co',
            dealType: 'Standard',
            stage: 'Qualified',
            healthyMaxDays: 5,
            warningMaxDays: 10,
            highRiskMinDays: 15
        })

        const res = await request(app)
            .get('/api/risk-benchmarks')
            .set('Authorization', `Bearer ${regularToken}`)
        
        expect(res.status).toBe(200)
        expect(res.body.benchmarks.length).toBe(1)
        expect(res.body.benchmarks[0].stage).toBe('Qualified')
    })

    it('GET /api/risk-benchmarks - 401 unauthenticated', async () => {
        const res = await request(app).get('/api/risk-benchmarks')
        expect(res.status).toBe(401)
    })

    it('POST /api/risk-benchmarks - 403 regular user rejected', async () => {
        const res = await request(app)
            .post('/api/risk-benchmarks')
            .set('Authorization', `Bearer ${regularToken}`)
            .send({ stage: 'Qualified', healthyMaxDays: 5, warningMaxDays: 10, highRiskMinDays: 15 })
        expect(res.status).toBe(403)
    })

    it('POST /api/risk-benchmarks - 201 Admin creates benchmark', async () => {
        const res = await request(app)
            .post('/api/risk-benchmarks')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ stage: 'Contact Made', healthyMaxDays: 5, warningMaxDays: 10, highRiskMinDays: 15 })
        expect(res.status).toBe(201)
        expect(res.body.benchmark.stage).toBe('Contact Made')
    })

    it('POST /api/risk-benchmarks - 409 prevents duplicate for same dealType/stage', async () => {
        await request(app)
            .post('/api/risk-benchmarks')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ stage: 'Proposal Made', healthyMaxDays: 5, warningMaxDays: 10, highRiskMinDays: 15 })
        
        const res = await request(app)
            .post('/api/risk-benchmarks')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ stage: 'Proposal Made', healthyMaxDays: 5, warningMaxDays: 10, highRiskMinDays: 15 })
        expect(res.status).toBe(409)
    })

    it('PATCH /api/risk-benchmarks/:id - Admin updates numeric days', async () => {
        const createRes = await request(app)
            .post('/api/risk-benchmarks')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ stage: 'Negotiation', healthyMaxDays: 5, warningMaxDays: 10, highRiskMinDays: 15 })
        
        const id = createRes.body.benchmark.id
        
        const updateRes = await request(app)
            .patch(`/api/risk-benchmarks/${id}`)
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ healthyMaxDays: 7 })
        
        expect(updateRes.status).toBe(200)
        expect(updateRes.body.benchmark.healthyMaxDays).toBe(7)
        expect(updateRes.body.benchmark.warningMaxDays).toBe(10) // Unchanged
    })

    it('DELETE /api/risk-benchmarks/:id - Admin deletes benchmark', async () => {
        const createRes = await request(app)
            .post('/api/risk-benchmarks')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ stage: 'Demo Scheduled', healthyMaxDays: 1, warningMaxDays: 2, highRiskMinDays: 3 })
        
        const id = createRes.body.benchmark.id
        
        const deleteRes = await request(app)
            .delete(`/api/risk-benchmarks/${id}`)
            .set('Authorization', `Bearer ${adminToken}`)
        
        expect(deleteRes.status).toBe(200)
        
        const verifyRes = await request(app)
            .get('/api/risk-benchmarks')
            .set('Authorization', `Bearer ${adminToken}`)
        expect(verifyRes.body.benchmarks.length).toBe(0)
    })
})
