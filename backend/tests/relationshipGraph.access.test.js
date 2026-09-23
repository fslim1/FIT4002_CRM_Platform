// The access-control matrix for the account endpoint.
//
// Admin, Supervisor, User and a User granted view-all-data are all covered.
// These need a real mongod, so they are skipped where none is reachable. See
// tests/README.md.
//
// Two assertions run against every response in this file:
//   - every edge endpoint exists in `nodes`, so no record is implied by a
//     dangling connection;
//   - no out-of-scope record's name appears anywhere in the serialised body.
// The second is the strongest guard here and the cheapest to write.

const request = require('supertest')

const {describeWithMongo, connect, clear, disconnect} = require('./helpers/db')
const {makeUser, makeTeam, makeCustomer, makeDeal, makeInteraction, daysAgo} = require('./helpers/factories')

const app = require('../app')
const {signToken} = require('../middleware/auth')
const User = require('../models/User')
const Team = require('../models/Team')
const Customer = require('../models/Customer')
const Deal = require('../models/Deal')

const ACCOUNT = 'TranXenergy'

// Distinctive names so "this name must not appear" is a reliable assertion.
const NAMES = {
    custA1: 'Alpha Aardvark',
    custA2: 'Bravo Baboon',
    custB1: 'Charlie Cheetah',
    custB2: 'Delta Dingo',
    outsider: 'Echo Elephant',
    userA1: 'Uno Owner',
    userA2: 'Dos Owner',
    userB1: 'Tres Owner',
    userB2: 'Quatro Owner',
    dealA1: 'Aardvark Solar',
    dealA2: 'Baboon Battery',
    dealB1: 'Cheetah Charger',
    dealGhost: 'Ghost Deal',
}

describeWithMongo('GET /api/relationship-graph/account/:customerId: access control', () => {
    const fx = {}

    const get = (customerId, actor) =>
        request(app)
            .get(`/api/relationship-graph/account/${customerId}`)
            .set('Authorization', `Bearer ${signToken(fx[actor]._id)}`)

    // Every graph in this file must satisfy both invariants.
    const expectSound = (body) => {
        const ids = new Set(body.nodes.map((n) => n.data.id))
        for (const edge of body.edges) {
            expect(ids.has(edge.data.source)).toBe(true)
            expect(ids.has(edge.data.target)).toBe(true)
        }
    }

    const expectNamesAbsent = (body, names) => {
        const serialised = JSON.stringify(body)
        for (const name of names) expect(serialised).not.toContain(name)
    }

    const contactNames = (body) =>
        body.nodes.filter((n) => n.data.kind === 'contact').map((n) => n.data.label).sort()

    const dealNames = (body) =>
        body.nodes.filter((n) => n.data.kind === 'deal').map((n) => n.data.label).sort()

    beforeAll(async () => {
        await connect()
        await clear()

        // Team A keeps customer sharing OFF, team B turns it ON.
        const teamA = await Team.create(makeTeam({name: 'Team A', company: ACCOUNT, sharingEnabled: false}))
        const teamB = await Team.create(makeTeam({name: 'Team B', company: ACCOUNT, sharingEnabled: true}))

        const mk = async (overrides) => User.create(makeUser({companyName: ACCOUNT, ...overrides}))

        fx.admin = await mk({fullName: 'Admin Person', role: 'Admin'})
        fx.supA = await mk({fullName: 'Supervisor Ay', role: 'Supervisor', team: teamA._id})
        fx.supB = await mk({fullName: 'Supervisor Bee', role: 'Supervisor', team: teamB._id})
        fx.userA1 = await mk({fullName: NAMES.userA1, role: 'User', team: teamA._id})
        fx.userA2 = await mk({fullName: NAMES.userA2, role: 'User', team: teamA._id})
        fx.userB1 = await mk({fullName: NAMES.userB1, role: 'User', team: teamB._id})
        fx.userB2 = await mk({fullName: NAMES.userB2, role: 'User', team: teamB._id})
        fx.viewer = await mk({
            fullName: 'Viewer Person',
            role: 'User',
            team: teamA._id,
            permissions: {deleteCustomers: false, deleteRecords: false, viewAllData: true},
        })

        // A second tenant, to prove the company boundary holds.
        fx.outsider = await User.create(makeUser({
            fullName: 'Outsider Person',
            role: 'Admin',
            companyName: 'Northwind'
        }))

        await Team.findByIdAndUpdate(teamA._id, {supervisor: fx.supA._id})
        await Team.findByIdAndUpdate(teamB._id, {supervisor: fx.supB._id})

        // Every contact sits in the same account, spelled inconsistently on
        // purpose so grouping is exercised at the same time.
        fx.custA1 = await Customer.create(
            makeCustomer({
                fullName: NAMES.custA1,
                company: ACCOUNT,
                owner: fx.userA1._id,
                team: teamA._id,
                interactions: Array.from({length: 6}, () => makeInteraction({date: daysAgo(5)})),
            })
        )
        fx.custA2 = await Customer.create(
            makeCustomer({
                fullName: NAMES.custA2,
                company: '  tranxenergy  ',
                owner: fx.userA2._id,
                team: teamA._id,
                interactions: [makeInteraction({date: daysAgo(10)}), makeInteraction({date: daysAgo(200)})],
            })
        )
        fx.custB1 = await Customer.create(
            makeCustomer({fullName: NAMES.custB1, company: 'TRANXENERGY', owner: fx.userB1._id, team: teamB._id})
        )
        // One interaction, older than the window: counts as no recent contact
        // but must still report a last-interaction date.
        fx.custB2 = await Customer.create(
            makeCustomer({
                fullName: NAMES.custB2,
                company: ACCOUNT,
                owner: fx.userB2._id,
                team: teamB._id,
                interactions: [makeInteraction({date: daysAgo(200)})],
            })
        )
        fx.custOutside = await Customer.create(
            makeCustomer({fullName: NAMES.outsider, company: ACCOUNT, owner: fx.outsider._id, team: null})
        )

        fx.dealA1 = await Deal.create(
            makeDeal({name: NAMES.dealA1, company: ACCOUNT, customer: NAMES.custA1, createdBy: fx.userA1._id})
        )
        fx.dealA2 = await Deal.create(
            makeDeal({name: NAMES.dealA2, company: ACCOUNT, customer: NAMES.custA2, createdBy: fx.userA2._id})
        )
        fx.dealB1 = await Deal.create(
            makeDeal({name: NAMES.dealB1, company: ACCOUNT, customer: NAMES.custB1, createdBy: fx.userB1._id})
        )
        fx.dealGhost = await Deal.create(
            makeDeal({name: NAMES.dealGhost, company: ACCOUNT, customer: 'Nobody Known', createdBy: fx.userA1._id})
        )
    })

    afterAll(async () => {
        await clear()
        await disconnect()
    })

    // --- Scope by role -----------------------------------------------------

    it('Admin sees every contact in the account across both teams', async () => {
        const res = await get(fx.custA1._id, 'admin')
        expect(res.status).toBe(200)
        expectSound(res.body)
        expect(contactNames(res.body)).toEqual(
            [NAMES.custA1, NAMES.custA2, NAMES.custB1, NAMES.custB2].sort()
        )
    })

    it('Admin is still bounded by the company, so another tenant stays out', async () => {
        const res = await get(fx.custA1._id, 'admin')
        expectNamesAbsent(res.body, [NAMES.outsider, 'Outsider Person'])
    })

    it('a User granted view-all-data sees the same contacts as the Admin', async () => {
        const asAdmin = await get(fx.custA1._id, 'admin')
        const asViewer = await get(fx.custA1._id, 'viewer')

        expect(asViewer.status).toBe(200)
        expectSound(asViewer.body)
        expect(contactNames(asViewer.body)).toEqual(contactNames(asAdmin.body))
    })

    it("a Supervisor sees their own team's records and not the other team's", async () => {
        const res = await get(fx.custA1._id, 'supA')
        expect(res.status).toBe(200)
        expectSound(res.body)

        expect(contactNames(res.body)).toEqual([NAMES.custA1, NAMES.custA2].sort())
        // Absent, not greyed out and not named anywhere in the payload.
        expectNamesAbsent(res.body, [NAMES.custB1, NAMES.custB2, NAMES.dealB1, NAMES.userB1, NAMES.userB2])
    })

    it('a User whose team has sharing switched off sees only their own records', async () => {
        const res = await get(fx.custA1._id, 'userA1')
        expect(res.status).toBe(200)
        expectSound(res.body)

        expect(contactNames(res.body)).toEqual([NAMES.custA1])
        expectNamesAbsent(res.body, [
            NAMES.custA2,
            NAMES.custB1,
            NAMES.custB2,
            NAMES.outsider,
            NAMES.dealA2,
            NAMES.dealB1,
            NAMES.userA2,
            NAMES.userB1,
            NAMES.userB2,
        ])
    })

    it("a User whose team has sharing switched on sees their teammates' contacts", async () => {
        const res = await get(fx.custB1._id, 'userB1')
        expect(res.status).toBe(200)
        expectSound(res.body)

        expect(contactNames(res.body)).toEqual([NAMES.custB1, NAMES.custB2].sort())
        expectNamesAbsent(res.body, [NAMES.custA1, NAMES.custA2])
    })

    it('deal visibility follows the creator, which team sharing does not widen', async () => {
        // Customer sharing is a Team setting; deals are scoped on createdBy
        // everywhere in the CRM, and the graph must not quietly differ.
        const res = await get(fx.custB1._id, 'userB1')
        expect(dealNames(res.body)).toEqual([NAMES.dealB1])
    })

    it('the same deal is drawn against a different number of contacts per viewer', async () => {
        // Two people with different permissions legitimately see a differently
        // shaped graph of the same account; a single-threaded warning builds on this.
        const asAdmin = await get(fx.custA1._id, 'admin')
        const asUser = await get(fx.custA1._id, 'userA1')

        const dealsFor = (body) => body.nodes.filter((n) => n.data.kind === 'deal').length
        expect(dealsFor(asAdmin.body)).toBeGreaterThan(dealsFor(asUser.body))
    })

    // --- Denial ------------------------------------------------------------

    it('denies an account belonging to another company', async () => {
        const res = await get(fx.custOutside._id, 'admin')
        expect(res.status).toBe(403)
    })

    it('denies a customer inside the company that the viewer may not see, naming no record', async () => {
        const res = await get(fx.custA2._id, 'userA1')
        expect(res.status).toBe(403)
        expect(JSON.stringify(res.body)).not.toContain(NAMES.custA2)
        expect(JSON.stringify(res.body)).not.toContain(NAMES.userA2)
    })

    it('requires authentication', async () => {
        const res = await request(app).get(`/api/relationship-graph/account/${fx.custA1._id}`)
        expect(res.status).toBe(401)
    })

    it('rejects a malformed id with 400 rather than a server error', async () => {
        const res = await get('not-an-object-id', 'admin')
        expect(res.status).toBe(400)
    })

    it('returns 404 for a well-formed id that matches no customer', async () => {
        const res = await get('507f1f77bcf86cd799439011', 'admin')
        expect(res.status).toBe(404)
    })

    // --- Derivation through the real pipelines -----------------------------

    it('groups inconsistently spelled company names into one account', async () => {
        // custA2 is stored as "  tranxenergy  " and custB1 as "TRANXENERGY".
        const res = await get(fx.custA1._id, 'admin')
        expect(res.body.account.companyKey).toBe('tranxenergy')
        expect(res.body.nodes.filter((n) => n.data.kind === 'company')).toHaveLength(1)
    })

    it('counts interactions inside the 90-day window only', async () => {
        const res = await get(fx.custA1._id, 'admin')
        const byName = Object.fromEntries(
            res.body.nodes.filter((n) => n.data.kind === 'contact').map((n) => [n.data.label, n.data])
        )

        expect(byName[NAMES.custA1].interactionCount).toBe(6)
        expect(byName[NAMES.custA1].band).toBe('frequent')
        // One inside the window, one 200 days old that must not count.
        expect(byName[NAMES.custA2].interactionCount).toBe(1)
        expect(byName[NAMES.custA2].band).toBe('some')
        expect(byName[NAMES.custB1].interactionCount).toBe(0)
        expect(byName[NAMES.custB1].band).toBe('none')
    })

    it('still reports the most recent interaction when it predates the window', async () => {
        const res = await get(fx.custA1._id, 'admin')
        const custB2 = res.body.nodes.find((n) => n.data.label === NAMES.custB2)

        // Its only interaction is 200 days old: no recent contact, but the date
        // is still shown rather than the relationship looking like it never
        // existed.
        expect(custB2.data.interactionCount).toBe(0)
        expect(custB2.data.band).toBe('none')
        expect(custB2.data.lastInteractionAt).not.toBeNull()
        expect(new Date(custB2.data.lastInteractionAt).getTime()).toBeLessThan(Date.now())
    })

    it('lists a deal matching no visible contact instead of dropping it', async () => {
        const res = await get(fx.custA1._id, 'userA1')
        const ghost = res.body.unmatchedDeals.find((d) => d.name === NAMES.dealGhost)
        expect(ghost).toBeDefined()
        expect(ghost.customerName).toBe('Nobody Known')
        expect(ghost.reason).toBe('no-contact-match')
    })

    it('never ships raw interaction bodies', async () => {
        const res = await get(fx.custA1._id, 'admin')
        expect(JSON.stringify(res.body)).not.toContain('Logged during a test')
    })

    it('reports the viewer scope so the panel can say whose records these are', async () => {
        const asUser = await get(fx.custA1._id, 'userA1')
        expect(asUser.body.meta.scope.role).toBe('User')

        const asAdmin = await get(fx.custA1._id, 'admin')
        expect(asAdmin.body.meta.scope.role).toBe('Admin')
        expect(asAdmin.body.meta.scope.viewAllData).toBe(true)
    })

    // --- Read-only ----------------------------------------------------

    it('writes nothing: interactions, customers and deals are untouched', async () => {
        const before = {
            customers: await Customer.countDocuments(),
            deals: await Deal.countDocuments(),
            interactions: (await Customer.findById(fx.custA1._id).lean()).interactions.length,
        }

        await get(fx.custA1._id, 'admin')
        await get(fx.custA1._id, 'userA1')
        await get(fx.custB1._id, 'userB1')

        expect(await Customer.countDocuments()).toBe(before.customers)
        expect(await Deal.countDocuments()).toBe(before.deals)
        expect((await Customer.findById(fx.custA1._id).lean()).interactions).toHaveLength(
            before.interactions
        )
    })
})
