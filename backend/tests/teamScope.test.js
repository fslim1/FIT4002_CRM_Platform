/**
 * teamScope unit tests — direct function calls, no HTTP.
 *
 * Tests exported helpers from middleware/teamScope.js.
 * All behaviour derived from reading the actual source.
 *
 * Key rules from teamScope.js:
 *   seesEverything(user):
 *     - user.role === 'Admin'  → true
 *     - hasPermission(user, 'viewAllData') where:
 *         user.role === 'Admin' → always true (but already caught above)
 *         user.permissions.viewAllData === true → true
 *         otherwise → false
 *     - null/undefined user → false (hasPermission guards null)
 *
 *   getVisibleDealFilter(user):
 *     - seesEverything → { createdBy: { $in: <company member IDs> } }
 *     - Supervisor     → { createdBy: { $in: <team member IDs> } }
 *     - User           → { createdBy: user._id }
 *
 *   canAccessDeal(user, deal):
 *     - deal.createdBy is null/undefined → false
 *     - seesEverything: checks company membership
 *     - Supervisor: checks team membership
 *     - User: strict owner check
 *
 * We use real mongoose Documents created in the in-memory DB so the
 * helpers can run their own DB queries without mocking.
 * We do NOT assert exact ObjectId arrays (brittle); instead we check
 * the semantically important shape ($in / $or / direct _id).
 */

const mongoose = require('mongoose')
const User = require('../models/User')
const Team = require('../models/Team')
const {
    seesEverything,
    getVisibleDealFilter,
    canAccessDeal,
    getCompanyUserIds,
} = require('../middleware/teamScope')

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let _c = 0
const ue = (p = 'ts') => `${p}_${++_c}_${Date.now()}@example.com`

/** Create a minimal User document directly in MongoDB (no bcrypt, no HTTP). */
const makeUser = async (overrides = {}) => {
    return User.create({
        fullName: 'Scope Tester',
        email: ue(),
        password: 'hashedDoesNotMatterHere1',
        companyName: 'ScopeCo',
        role: 'User',
        authProvider: 'local',
        ...overrides,
    })
}

beforeEach(async () => {
    await User.deleteMany({})
    await Team.deleteMany({})
})

// ─── seesEverything ───────────────────────────────────────────────────────────

describe('seesEverything()', () => {
    it('returns true for Admin role', () => {
        const user = { role: 'Admin', permissions: {} }
        expect(seesEverything(user)).toBe(true)
    })

    it('returns false for regular User with default permissions', () => {
        const user = { role: 'User', permissions: { viewAllData: false } }
        expect(seesEverything(user)).toBe(false)
    })

    it('returns false for Supervisor without viewAllData permission', () => {
        const user = { role: 'Supervisor', permissions: { viewAllData: false } }
        expect(seesEverything(user)).toBe(false)
    })

    it('returns true for User who has been granted viewAllData permission', () => {
        const user = { role: 'User', permissions: { viewAllData: true } }
        expect(seesEverything(user)).toBe(true)
    })

    it('returns false when permissions object is missing (no crash)', () => {
        const user = { role: 'User' }
        expect(seesEverything(user)).toBe(false)
    })

    it('returns false when viewAllData is undefined on the permissions object', () => {
        const user = { role: 'User', permissions: {} }
        expect(seesEverything(user)).toBe(false)
    })
})

// ─── getVisibleDealFilter ─────────────────────────────────────────────────────

describe('getVisibleDealFilter()', () => {
    it('Admin: filter uses $in with a company-bounded ID list', async () => {
        const admin = await makeUser({ role: 'Admin', companyName: 'ScopeCo' })
        const filter = await getVisibleDealFilter(admin)
        // seesEverything → { createdBy: { $in: [...] } }
        expect(filter).toHaveProperty('createdBy')
        expect(filter.createdBy).toHaveProperty('$in')
        expect(Array.isArray(filter.createdBy.$in)).toBe(true)
    })

    it('Admin filter includes the admin\'s own ID in the $in list', async () => {
        const admin = await makeUser({ role: 'Admin', companyName: 'ScopeCo' })
        const filter = await getVisibleDealFilter(admin)
        const ids = filter.createdBy.$in.map(String)
        expect(ids).toContain(String(admin._id))
    })

    it('regular User: filter is { createdBy: user._id }', async () => {
        const user = await makeUser({ role: 'User' })
        const filter = await getVisibleDealFilter(user)
        // No seesEverything, no Supervisor → direct owner filter
        expect(String(filter.createdBy)).toBe(String(user._id))
    })

    it('Supervisor: filter uses $in with team member IDs', async () => {
        const supervisor = await makeUser({ role: 'Supervisor', companyName: 'ScopeCo' })
        const filter = await getVisibleDealFilter(supervisor)
        // Supervisor path: { createdBy: { $in: [...] } }
        expect(filter).toHaveProperty('createdBy')
        expect(filter.createdBy).toHaveProperty('$in')
    })

    it('User with viewAllData permission: filter uses $in (company bounded)', async () => {
        const user = await makeUser({
            role: 'User',
            permissions: { viewAllData: true },
            companyName: 'ScopeCo',
        })
        const filter = await getVisibleDealFilter(user)
        // seesEverything → $in path
        expect(filter.createdBy).toHaveProperty('$in')
    })
})

// ─── canAccessDeal ────────────────────────────────────────────────────────────

describe('canAccessDeal()', () => {
    it('returns false when deal.createdBy is null', async () => {
        const user = await makeUser({ role: 'User' })
        const fakeDeal = { createdBy: null }
        const result = await canAccessDeal(user, fakeDeal)
        expect(result).toBe(false)
    })

    it('returns true when user is the deal owner', async () => {
        const user = await makeUser({ role: 'User' })
        const fakeDeal = { createdBy: user._id }
        const result = await canAccessDeal(user, fakeDeal)
        expect(result).toBe(true)
    })

    it('returns false when a different User tries to access another\'s deal', async () => {
        const owner = await makeUser({ role: 'User', companyName: 'ScopeCo' })
        const other = await makeUser({ role: 'User', companyName: 'ScopeCo' })
        const fakeDeal = { createdBy: owner._id }
        const result = await canAccessDeal(other, fakeDeal)
        expect(result).toBe(false)
    })

    it('returns true when Admin accesses a deal created by someone in the same company', async () => {
        const admin = await makeUser({ role: 'Admin', companyName: 'ScopeCo' })
        const colleague = await makeUser({ role: 'User', companyName: 'ScopeCo' })
        const fakeDeal = { createdBy: colleague._id }
        const result = await canAccessDeal(admin, fakeDeal)
        expect(result).toBe(true)
    })

    it('returns false when Admin tries to access a deal from a different company', async () => {
        const admin = await makeUser({ role: 'Admin', companyName: 'CompanyA' })
        const outsider = await makeUser({ role: 'User', companyName: 'CompanyB' })
        const fakeDeal = { createdBy: outsider._id }
        const result = await canAccessDeal(admin, fakeDeal)
        expect(result).toBe(false)
    })
})

// ─── getCompanyUserIds ────────────────────────────────────────────────────────

describe('getCompanyUserIds()', () => {
    it('returns an array that always includes the requesting user\'s own ID', async () => {
        const user = await makeUser({ companyName: 'ScopeCo' })
        const ids = await getCompanyUserIds(user)
        expect(ids.map(String)).toContain(String(user._id))
    })

    it('returns IDs for all users in the same company (case-insensitive)', async () => {
        await makeUser({ companyName: 'ScopeCo' })       // user 1
        await makeUser({ companyName: 'scopeco' })        // user 2 — same company, different case
        const admin = await makeUser({ role: 'Admin', companyName: 'ScopeCo' })

        const ids = await getCompanyUserIds(admin)
        // All three ScopeCo users should be included
        expect(ids.length).toBeGreaterThanOrEqual(3)
    })

    it('does NOT include users from a different company', async () => {
        const outsider = await makeUser({ companyName: 'OtherCo' })
        const user = await makeUser({ companyName: 'ScopeCo' })

        const ids = await getCompanyUserIds(user)
        expect(ids.map(String)).not.toContain(String(outsider._id))
    })
})
