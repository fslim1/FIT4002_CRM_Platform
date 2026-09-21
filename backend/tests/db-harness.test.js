// Self-test for the database harness. It is skipped when no mongod could be
// resolved (see tests/README.md), so on a restricted network `npm test` still
// passes; anywhere a mongod is reachable it proves connect / clear / disconnect
// and the factories work end to end before anything else relies on them.

const {describeWithMongo, connect, clear, disconnect} = require('./helpers/db')
const {makeCustomer, makeDeal, makeTask, makeInteraction, oid} = require('./helpers/factories')

const Customer = require('../models/Customer')
const Deal = require('../models/Deal')
const Task = require('../models/Task')

describe('db helper guards', () => {
    // globalSetup communicates its result to the workers through process.env.
    // Every database-backed suite depends on that propagation, so assert it
    // directly rather than inferring it from a suite that may be skipped.
    it('receives globalSetup\'s mongod resolution', () => {
        expect(['0', '1']).toContain(process.env.MONGO_TEST_AVAILABLE)
        if (process.env.MONGO_TEST_AVAILABLE === '1') {
            expect(process.env.MONGO_TEST_URI).toMatch(/^mongodb:\/\//)
        }
    })

    it('connect() refuses to run without a mongod, naming the fix', async () => {
        const original = process.env.MONGO_TEST_AVAILABLE
        process.env.MONGO_TEST_AVAILABLE = '0'
        try {
            await expect(connect()).rejects.toThrow(/describeWithMongo/)
        } finally {
            process.env.MONGO_TEST_AVAILABLE = original
        }
    })
})

describeWithMongo('database round trip', () => {
    beforeAll(async () => {
        await connect()
    })

    afterEach(async () => {
        await clear()
    })

    afterAll(async () => {
        await disconnect()
    })

    it('persists and reads back a customer built by the factory', async () => {
        const owner = oid()
        await Customer.create(
            makeCustomer({
                fullName: 'Jane Doe',
                company: 'TranXenergy',
                owner,
                interactions: [makeInteraction({type: 'Call'})],
            })
        )

        const found = await Customer.findOne({fullName: 'Jane Doe'}).lean()
        expect(found).not.toBeNull()
        expect(found.company).toBe('TranXenergy')
        expect(String(found.owner)).toBe(String(owner))
        expect(found.interactions).toHaveLength(1)
        expect(found.interactions[0].type).toBe('Call')
    })

    it('persists a deal and a task that reference real documents', async () => {
        const creator = oid()
        const customer = await Customer.create(makeCustomer({fullName: 'Jane Doe'}))
        const deal = await Deal.create(
            makeDeal({name: 'Solar grid expansion', customer: 'Jane Doe', createdBy: creator})
        )
        const task = await Task.create(
            makeTask({customer: customer._id, deal: deal._id, createdBy: creator})
        )

        const found = await Task.findById(task._id).lean()
        expect(String(found.customer)).toBe(String(customer._id))
        expect(String(found.deal)).toBe(String(deal._id))
    })

    it('clear() empties collections between tests', async () => {
        await Customer.create(makeCustomer())
        expect(await Customer.countDocuments()).toBe(1)
        await clear()
        expect(await Customer.countDocuments()).toBe(0)
    })

    // Confirms the indexes added for the relationship graph's scope filter are
    // real indexes in MongoDB, not just schema declarations.
    it('creates the scope-filter indexes declared on the schemas', async () => {
        await Customer.syncIndexes()
        await Deal.syncIndexes()

        const customerIndexes = (await Customer.collection.indexes()).map((i) => i.name)
        const dealIndexes = (await Deal.collection.indexes()).map((i) => i.name)

        expect(customerIndexes).toEqual(expect.arrayContaining(['owner_1', 'team_1']))
        expect(dealIndexes).toEqual(expect.arrayContaining(['createdBy_1']))
    })
})
