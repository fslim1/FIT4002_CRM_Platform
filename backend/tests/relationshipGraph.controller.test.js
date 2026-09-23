// The controller's own logic, without a database.
//
// The model statics are replaced with stubs whose aggregate() runs the REAL
// pipeline builders through mingo over in-memory documents. So this exercises
// the controller's actual flow, meaning status codes, query wiring and
// response assembly, rather than a paraphrase of it.
//
// The database-backed matrix in relationshipGraph.access.test.js is what proves
// the scope filters themselves behave against a real server. What this file
// adds is proof that the controller PUTS those filters into the query at all,
// which is the "enforced in the database query, never by hiding nodes in the
// browser".

const {Aggregator} = require('mingo')

jest.mock('../models/Customer', () => ({findById: jest.fn(), aggregate: jest.fn()}))
jest.mock('../models/Deal', () => ({aggregate: jest.fn()}))
jest.mock('../models/User', () => ({find: jest.fn()}))
jest.mock('../middleware/teamScope', () => ({
    getVisibleCustomerFilter: jest.fn(),
    getVisibleDealFilter: jest.fn(),
    canViewCustomer: jest.fn(),
    seesEverything: jest.fn(() => false),
}))

const Customer = require('../models/Customer')
const Deal = require('../models/Deal')
const User = require('../models/User')
const teamScope = require('../middleware/teamScope')
const {getAccountGraph} = require('../controllers/relationshipGraphController')

const FOCUS_ID = '507f1f77bcf86cd799439011'
const OTHER_ID = '507f1f77bcf86cd799439012'

const CUSTOMER_SCOPE = {owner: {$in: ['u1']}}
const DEAL_SCOPE = {createdBy: 'u1'}

const customerDocs = [
    {
        _id: FOCUS_ID,
        fullName: 'Jane Doe',
        company: 'TranXenergy',
        designation: 'Procurement Lead',
        department: 'Procurement',
        owner: 'u1',
        interactions: [{type: 'Call', details: 'secret notes', date: new Date()}],
    },
    {
        _id: OTHER_ID,
        fullName: 'Ravi Patel',
        company: '  tranxenergy  ',
        designation: 'Engineer',
        department: 'Engineering',
        owner: 'u1',
        interactions: [],
    },
]

const dealDocs = [
    {
        _id: 'd1',
        name: 'Solar grid expansion',
        company: 'TranXenergy',
        customer: 'Jane Doe',
        stage: 'Proposal Made',
        createdBy: 'u1',
        price: '48000'
    },
    {
        _id: 'd2',
        name: 'Ghost deal',
        company: 'TranXenergy',
        customer: 'Nobody Known',
        stage: 'Qualified',
        createdBy: 'u1',
        price: '1'
    },
]

const userDocs = [{_id: 'u1', fullName: 'Sam Rep'}]

const makeRes = () => {
    const res = {statusCode: 200, body: undefined}
    res.status = (code) => {
        res.statusCode = code
        return res
    }
    res.json = (body) => {
        res.body = body
        return res
    }
    return res
}

const req = (customerId = FOCUS_ID, user = {_id: 'u1', role: 'User', permissions: {}}) => ({
    params: {customerId},
    user,
})

const call = async (request = req()) => {
    const res = makeRes()
    await getAccountGraph(request, res)
    return res
}

beforeEach(() => {
    jest.clearAllMocks()

    teamScope.getVisibleCustomerFilter.mockResolvedValue(CUSTOMER_SCOPE)
    teamScope.getVisibleDealFilter.mockResolvedValue(DEAL_SCOPE)
    teamScope.canViewCustomer.mockResolvedValue(true)
    teamScope.seesEverything.mockReturnValue(false)

    Customer.findById.mockReturnValue({
        select: () => Promise.resolve(customerDocs.find((c) => c._id === FOCUS_ID)),
    })
    // The real pipeline builders, run through a real aggregation engine.
    Customer.aggregate.mockImplementation(async (pipeline) => new Aggregator(pipeline).run(customerDocs))
    Deal.aggregate.mockImplementation(async (pipeline) => new Aggregator(pipeline).run(dealDocs))
    User.find.mockReturnValue({select: () => ({lean: () => Promise.resolve(userDocs)})})
})

describe('relationshipGraphController: request handling', () => {
    it('rejects a malformed customer id with 400', async () => {
        const res = await call(req('not-an-object-id'))
        expect(res.statusCode).toBe(400)
        expect(Customer.findById).not.toHaveBeenCalled()
    })

    it('returns 404 when the customer does not exist', async () => {
        Customer.findById.mockReturnValue({select: () => Promise.resolve(null)})
        const res = await call()
        expect(res.statusCode).toBe(404)
    })

    it('returns 403 when the viewer may not see the account, naming no record', async () => {
        teamScope.canViewCustomer.mockResolvedValue(false)
        const res = await call()

        expect(res.statusCode).toBe(403)
        expect(JSON.stringify(res.body)).not.toContain('Jane Doe')
        expect(JSON.stringify(res.body)).not.toContain('TranXenergy')
        // Denied before any account data is queried.
        expect(Customer.aggregate).not.toHaveBeenCalled()
        expect(Deal.aggregate).not.toHaveBeenCalled()
    })

    it('returns 404 if the focus contact disappears between the two queries', async () => {
        Customer.aggregate.mockResolvedValue([]) // deleted mid-request
        const res = await call()
        expect(res.statusCode).toBe(404)
    })

    it('turns an unexpected failure into a 500 without leaking internals', async () => {
        // The controller logs the real error on purpose; muted here so a
        // passing run does not print a stack trace that looks like a failure.
        const logged = jest.spyOn(console, 'error').mockImplementation(() => {
        })
        Customer.aggregate.mockRejectedValue(new Error('connection reset to cluster-7.internal'))
        const res = await call()
        expect(logged).toHaveBeenCalled()
        logged.mockRestore()

        expect(res.statusCode).toBe(500)
        expect(JSON.stringify(res.body)).not.toContain('cluster-7.internal')
    })
})

describe('relationshipGraphController: scope is enforced in the query', () => {
    it('puts the customer scope filter into the aggregation itself', async () => {
        await call()

        const pipeline = Customer.aggregate.mock.calls[0][0]
        // First stage, before anything else runs.
        expect(JSON.stringify(pipeline[0])).toContain(JSON.stringify(CUSTOMER_SCOPE))
    })

    it('puts the deal scope filter into the aggregation itself', async () => {
        await call()

        const pipeline = Deal.aggregate.mock.calls[0][0]
        expect(pipeline[0]).toEqual({$match: DEAL_SCOPE})
    })

    it('asks teamScope for the filters rather than deriving its own', async () => {
        const user = {_id: 'u1', role: 'Supervisor', permissions: {}}
        await call(req(FOCUS_ID, user))

        expect(teamScope.getVisibleCustomerFilter).toHaveBeenCalledWith(user)
        expect(teamScope.getVisibleDealFilter).toHaveBeenCalledWith(user)
    })

    it('checks canViewCustomer before returning anything', async () => {
        await call()
        expect(teamScope.canViewCustomer).toHaveBeenCalledTimes(1)
    })

    it('resolves each scope filter once per request', async () => {
        await call()

        // Both reach the database to work out who the viewer may see, so asking
        // twice would pay for the same answer twice.
        expect(teamScope.getVisibleCustomerFilter).toHaveBeenCalledTimes(1)
        expect(teamScope.getVisibleDealFilter).toHaveBeenCalledTimes(1)
    })

    it('looks up the focus record and both filters at the same time', async () => {
        // The focus lookup is held open. If the filters were resolved one after
        // it, neither would have been asked for yet by the time it is still
        // pending, and each would cost its own round trip.
        let releaseFocus
        Customer.findById.mockReturnValue({
            select: () => new Promise((resolve) => {
                releaseFocus = resolve
            }),
        })

        const res = makeRes()
        const pending = getAccountGraph(req(), res)
        await Promise.resolve()

        expect(teamScope.getVisibleCustomerFilter).toHaveBeenCalled()
        expect(teamScope.getVisibleDealFilter).toHaveBeenCalled()

        releaseFocus(customerDocs.find((c) => c._id === FOCUS_ID))
        await pending
        expect(res.statusCode).toBe(200)
    })

    it('resolves salespeople only from ids found on in-scope records', async () => {
        await call()
        expect(User.find).toHaveBeenCalledWith({_id: {$in: ['u1']}})
    })

    it('skips the salesperson query entirely when no record has an owner', async () => {
        Customer.aggregate.mockImplementation(async (pipeline) =>
            new Aggregator(pipeline).run(customerDocs.map((c) => ({...c, owner: null})))
        )
        Deal.aggregate.mockResolvedValue([])

        await call()
        expect(User.find).not.toHaveBeenCalled()
    })
})

describe('relationshipGraphController: the assembled response', () => {
    it('returns a graph built from the real pipelines', async () => {
        const res = await call()
        expect(res.statusCode).toBe(200)

        const kinds = res.body.nodes.map((n) => n.data.kind)
        expect(kinds).toContain('company')
        expect(kinds).toContain('contact')
        expect(kinds).toContain('deal')
        expect(kinds).toContain('salesperson')

        // Both contacts grouped despite the stored padding on the second.
        expect(res.body.nodes.filter((n) => n.data.kind === 'contact')).toHaveLength(2)
        expect(res.body.account.companyKey).toBe('tranxenergy')
    })

    it('adds generatedAt, buildMs and scope to the service meta', async () => {
        const res = await call()

        expect(new Date(res.body.meta.generatedAt).toISOString()).toBe(res.body.meta.generatedAt)
        expect(typeof res.body.meta.buildMs).toBe('number')
        expect(res.body.meta.buildMs).toBeGreaterThanOrEqual(0)
        expect(res.body.meta.scope).toEqual({
            role: 'User',
            viewAllData: false,
            label: 'the records you have access to',
        })
        // The service's own meta survives alongside them.
        expect(res.body.meta.windowDays).toBe(90)
        expect(res.body.meta.bands).toHaveLength(3)
    })

    it('describes an Admin as seeing the whole company', async () => {
        teamScope.seesEverything.mockReturnValue(true)
        const res = await call(req(FOCUS_ID, {_id: 'a1', role: 'Admin', permissions: {}}))

        expect(res.body.meta.scope).toEqual({
            role: 'Admin',
            viewAllData: true,
            label: "your company's records",
        })
    })

    it('lists a deal matching no contact instead of drawing it', async () => {
        const res = await call()

        expect(res.body.unmatchedDeals).toHaveLength(1)
        expect(res.body.unmatchedDeals[0].name).toBe('Ghost deal')
        expect(res.body.nodes.filter((n) => n.data.kind === 'deal')).toHaveLength(1)
    })

    it('never ships interaction bodies or unused customer fields', async () => {
        const res = await call()
        const serialised = JSON.stringify(res.body)

        expect(serialised).not.toContain('secret notes')
        expect(serialised).not.toContain('interactions')
    })

    it('emits no edge whose endpoints are missing from nodes', async () => {
        const res = await call()
        const ids = new Set(res.body.nodes.map((n) => n.data.id))

        expect(res.body.edges.length).toBeGreaterThan(0)
        for (const edge of res.body.edges) {
            expect(ids.has(edge.data.source)).toBe(true)
            expect(ids.has(edge.data.target)).toBe(true)
        }
    })

    it('issues exactly the queries the single request needs', async () => {
        await call()

        expect(Customer.findById).toHaveBeenCalledTimes(1)
        expect(Customer.aggregate).toHaveBeenCalledTimes(1)
        expect(Deal.aggregate).toHaveBeenCalledTimes(1)
        expect(User.find).toHaveBeenCalledTimes(1)
    })
})
