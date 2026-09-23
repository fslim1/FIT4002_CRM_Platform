// Account grouping over the endpoint, against a real server.
//
// Grouping is decided by the database's own string handling, so this is the
// only place it can actually be checked. The in-memory suites run the same
// pipelines through mingo, a JavaScript reimplementation, which folds case the
// way JavaScript does rather than the way the server does. They therefore
// cannot tell whether the two agree.
//
// The panel tells the viewer that matching "ignores capitals and surrounding
// spaces". Each case here is that promise, written for a company name a tenant
// might plausibly have. Needs a real mongod, so it is skipped where none is
// reachable. See tests/README.md.
//
// A failure here is a real limitation rather than a broken test: $toLower is
// documented as well defined for ASCII only, so a name outside ASCII may not
// fold the way the wording promises. The fix belongs in the query, not here.

const request = require('supertest')

const {describeWithMongo, connect, clear, disconnect} = require('./helpers/db')
const {makeUser, makeCustomer, makeDeal, makeInteraction, daysAgo} = require('./helpers/factories')

const app = require('../app')
const {signToken} = require('../middleware/auth')
const User = require('../models/User')
const Customer = require('../models/Customer')
const Deal = require('../models/Deal')

describeWithMongo('GET /api/relationship-graph/account/:customerId: grouping by company', () => {
    let admin

    const get = (customerId) =>
        request(app)
            .get(`/api/relationship-graph/account/${customerId}`)
            .set('Authorization', `Bearer ${signToken(admin._id)}`)

    const contactNames = (body) =>
        body.nodes.filter((n) => n.data.kind === 'contact').map((n) => n.data.label).sort()

    const dealNames = (body) =>
        body.nodes.filter((n) => n.data.kind === 'deal').map((n) => n.data.label).sort()

    // One tenant, one owner, so nothing here is shaped by access control.
    const seed = async (rows) => {
        const created = []
        for (const row of rows) {
            created.push(
                await Customer.create(
                    makeCustomer({owner: admin._id, team: null, ...row})
                )
            )
        }
        return created
    }

    beforeAll(async () => {
        await connect()
    })

    beforeEach(async () => {
        await clear()
        admin = await User.create(
            makeUser({fullName: 'Grouping Admin', role: 'Admin', companyName: 'Anyco'})
        )
    })

    afterAll(async () => {
        await disconnect()
    })

    describe('an ASCII company name', () => {
        it('groups spellings that differ only by case or surrounding space', async () => {
            const [focus] = await seed([
                {fullName: 'Ada Lovelace', company: 'Harbour Logistics'},
                {fullName: 'Bo Nilsen', company: 'HARBOUR LOGISTICS'},
                {fullName: 'Cy Adams', company: '  harbour logistics  '},
                {fullName: 'Not A Colleague', company: 'Harbour Logistics Pty'},
            ])

            const res = await get(focus._id)
            expect(res.status).toBe(200)
            expect(contactNames(res.body)).toEqual(['Ada Lovelace', 'Bo Nilsen', 'Cy Adams'])
        })

        it('does not treat a name containing pattern characters as a pattern', async () => {
            const [focus] = await seed([
                {fullName: 'Dana Whitfield', company: 'A+ Energy (Pty) Ltd. [NSW] *2024*'},
                {fullName: 'Regex Imposter One', company: 'A Energy Pty LtdX N 2024'},
                {fullName: 'Regex Imposter Two', company: 'A Energy Pty Ltd! S 202'},
            ])

            const res = await get(focus._id)
            expect(res.status).toBe(200)
            expect(contactNames(res.body)).toEqual(['Dana Whitfield'])
        })
    })

    describe('a company name outside ASCII', () => {
        it('groups an accented name spelled in different cases', async () => {
            const [focus] = await seed([
                {fullName: 'Lars Fischer', company: 'Müller Fertigung GmbH'},
                {fullName: 'Ines Weber', company: 'MÜLLER FERTIGUNG GMBH'},
            ])

            const res = await get(focus._id)
            expect(res.status).toBe(200)
            expect(contactNames(res.body)).toEqual(['Ines Weber', 'Lars Fischer'])
        })

        // Matching is deliberately locale-independent, and a few letters do not
        // survive a round trip through case without one. Turkish dotted and
        // dotless i are the clearest example, and the German sharp s is
        // another: upper-casing it yields two letters. Those spellings are
        // different names rather than the same one, which is the same rule the
        // panel already explains for a company written two ways.
        it('keeps dotted and dotless i as separate accounts', async () => {
            const [focus] = await seed([
                {fullName: 'Deniz Yilmaz', company: 'Işık Enerji'},
                {fullName: 'Ece Kaya', company: 'IŞIK ENERJİ'},
            ])

            const res = await get(focus._id)
            expect(res.status).toBe(200)
            expect(contactNames(res.body)).toEqual(['Deniz Yilmaz'])
        })

        it('keeps a sharp s and its two-letter spelling as separate accounts', async () => {
            const [focus] = await seed([
                {fullName: 'Ulf Brandt', company: 'Straße Werke'},
                {fullName: 'Eva Roth', company: 'Strasse Werke'},
            ])

            const res = await get(focus._id)
            expect(res.status).toBe(200)
            expect(contactNames(res.body)).toEqual(['Ulf Brandt'])
        })

        it('groups a name with no case at all', async () => {
            const [focus] = await seed([
                {fullName: '川口 花子', company: '川口リニューアブルズ株式会社'},
                {fullName: '佐藤 健', company: '  川口リニューアブルズ株式会社  '},
            ])

            const res = await get(focus._id)
            expect(res.status).toBe(200)
            expect(contactNames(res.body)).toEqual(['佐藤 健', '川口 花子'].sort())
        })
    })

    describe('drawing deals for any tenant', () => {
        it('draws a deal whose customer name differs only in case', async () => {
            const [focus] = await seed([
                {fullName: 'Mina Haddad', company: 'Cascade Health'},
            ])
            await Deal.create(
                makeDeal({
                    name: 'Bed management rollout',
                    company: 'Cascade Health',
                    customer: 'MINA HADDAD',
                    stage: 'Negotiation',
                    createdBy: admin._id,
                })
            )

            const res = await get(focus._id)
            expect(res.status).toBe(200)
            expect(dealNames(res.body)).toEqual(['Bed management rollout'])
            expect(res.body.unmatchedDeals).toEqual([])
        })

        it('draws a deal whose customer name carries an accent', async () => {
            const [focus] = await seed([
                {fullName: 'José Álvarez', company: "O'Brien & Sons"},
            ])
            await Deal.create(
                makeDeal({
                    name: 'Solar retrofit',
                    company: "O'Brien & Sons",
                    customer: 'josé álvarez',
                    createdBy: admin._id,
                })
            )

            const res = await get(focus._id)
            expect(res.status).toBe(200)
            expect(dealNames(res.body)).toEqual(['Solar retrofit'])
            expect(res.body.unmatchedDeals).toEqual([])
        })

        it('lists a deal that names nobody in the account rather than dropping it', async () => {
            const [focus] = await seed([{fullName: 'Nadia Fox', company: 'Beacon Analytics'}])
            await Deal.create(
                makeDeal({
                    name: 'Mystery order',
                    company: 'Beacon Analytics',
                    customer: 'Someone Not Here',
                    createdBy: admin._id,
                })
            )

            const res = await get(focus._id)
            expect(res.status).toBe(200)
            expect(dealNames(res.body)).toEqual([])
            expect(res.body.unmatchedDeals.map((d) => d.name)).toEqual(['Mystery order'])
        })
    })

    describe('interaction counting for any tenant', () => {
        it('counts what falls inside the window and dates the last touch', async () => {
            const [focus] = await seed([
                {
                    fullName: 'Tom Ide',
                    company: 'Pinewood Freight',
                    interactions: [
                        makeInteraction({date: daysAgo(3)}),
                        makeInteraction({date: daysAgo(70)}),
                        makeInteraction({date: daysAgo(300)}),
                    ],
                },
            ])

            const res = await get(focus._id)
            const node = res.body.nodes.find((n) => n.data.recordId === String(focus._id))

            expect(node.data.interactionCount).toBe(2)
            expect(node.data.band).toBe('some')
            expect(new Date(node.data.lastInteractionAt).getTime()).toBeGreaterThan(
                daysAgo(4).getTime()
            )
        })

        it('reports a contact with no company rather than inventing an account', async () => {
            // The schema marks company required, so a row without one cannot be
            // created through it. Such rows do exist, from records written
            // before the field was required and from updates that skip
            // validators, which is the state this notice is for. Saved with
            // validation off to reproduce it.
            const focus = new Customer(
                makeCustomer({fullName: 'Solo Contact', company: '', owner: admin._id, team: null})
            )
            await focus.save({validateBeforeSave: false})

            const res = await get(focus._id)
            expect(res.status).toBe(200)
            expect(res.body.notices.map((n) => n.code)).toEqual(['no-company'])
            expect(contactNames(res.body)).toEqual(['Solo Contact'])
        })
    })
})
