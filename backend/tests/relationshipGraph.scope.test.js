// The team and permission scope rules, exercised without a database.
//
// middleware/teamScope.js makes exactly two kinds of query, User.find and
// Team.find/findById, so stubbing those lets the REAL filter-building logic
// run, and mingo then applies the filters it produces to in-memory records.
// What comes back is what MongoDB would return for the same filter.
//
// This is the same matrix as relationshipGraph.access.test.js, one layer down:
// that suite proves it end to end through HTTP against a real server, this one
// proves the filters themselves on any machine.

const {Query} = require('mingo')

jest.mock('../models/User', () => ({find: jest.fn()}))
jest.mock('../models/Team', () => ({find: jest.fn(), findById: jest.fn()}))

const User = require('../models/User')
const Team = require('../models/Team')
const {getVisibleCustomerFilter, getVisibleDealFilter} = require('../middleware/teamScope')

const TEAM_A = 'teamA'
const TEAM_B = 'teamB'

const TEAMS = [
    {_id: TEAM_A, name: 'Team A', company: 'TranXenergy', supervisor: 'supA', sharingEnabled: false},
    {_id: TEAM_B, name: 'Team B', company: 'TranXenergy', supervisor: 'supB', sharingEnabled: true},
]

const USERS = [
    {_id: 'admin', fullName: 'Admin Person', companyName: 'TranXenergy', role: 'Admin', team: null, permissions: {}},
    {
        _id: 'supA',
        fullName: 'Supervisor Ay',
        companyName: 'TranXenergy',
        role: 'Supervisor',
        team: TEAM_A,
        permissions: {}
    },
    {
        _id: 'supB',
        fullName: 'Supervisor Bee',
        companyName: 'TranXenergy',
        role: 'Supervisor',
        team: TEAM_B,
        permissions: {}
    },
    {_id: 'userA1', fullName: 'Uno Owner', companyName: 'TranXenergy', role: 'User', team: TEAM_A, permissions: {}},
    {_id: 'userA2', fullName: 'Dos Owner', companyName: 'TranXenergy', role: 'User', team: TEAM_A, permissions: {}},
    {_id: 'userB1', fullName: 'Tres Owner', companyName: 'TranXenergy', role: 'User', team: TEAM_B, permissions: {}},
    {_id: 'userB2', fullName: 'Quatro Owner', companyName: 'TranXenergy', role: 'User', team: TEAM_B, permissions: {}},
    {
        _id: 'viewer',
        fullName: 'Viewer Person',
        companyName: 'TranXenergy',
        role: 'User',
        team: TEAM_A,
        permissions: {viewAllData: true}
    },
    {
        _id: 'outsider',
        fullName: 'Outsider Person',
        companyName: 'Northwind',
        role: 'Admin',
        team: null,
        permissions: {}
    },
]

const CUSTOMERS = [
    {_id: 'custA1', fullName: 'Alpha Aardvark', company: 'TranXenergy', owner: 'userA1', team: TEAM_A},
    {_id: 'custA2', fullName: 'Bravo Baboon', company: 'TranXenergy', owner: 'userA2', team: TEAM_A},
    {_id: 'custB1', fullName: 'Charlie Cheetah', company: 'TranXenergy', owner: 'userB1', team: TEAM_B},
    {_id: 'custB2', fullName: 'Delta Dingo', company: 'TranXenergy', owner: 'userB2', team: TEAM_B},
    {_id: 'custOutside', fullName: 'Echo Elephant', company: 'TranXenergy', owner: 'outsider', team: null},
    {_id: 'legacy', fullName: 'Foxtrot Legacy', company: 'TranXenergy', owner: null, team: null},
]

const DEALS = [
    {_id: 'dealA1', name: 'Aardvark Solar', createdBy: 'userA1'},
    {_id: 'dealA2', name: 'Baboon Battery', createdBy: 'userA2'},
    {_id: 'dealB1', name: 'Cheetah Charger', createdBy: 'userB1'},
    {_id: 'dealOutside', name: 'Elephant Export', createdBy: 'outsider'},
]

const user = (id) => USERS.find((u) => u._id === id)

const matching = (filter, docs) => new Query(filter).find(docs).all().map((d) => d._id).sort()

beforeEach(() => {
    jest.clearAllMocks()

    // teamScope's real queries, answered from the fixtures above.
    User.find.mockImplementation((filter) => ({
        select: () => Promise.resolve(new Query(filter).find(USERS).all()),
    }))
    Team.find.mockImplementation((filter) => ({
        select: () => Promise.resolve(new Query(filter).find(TEAMS).all()),
    }))
    Team.findById.mockImplementation((id) => ({
        select: () => Promise.resolve(TEAMS.find((t) => String(t._id) === String(id)) || null),
    }))
})

describe('customer scope by role', () => {
    it('Admin sees every customer owned inside their own company, plus legacy records', async () => {
        const filter = await getVisibleCustomerFilter(user('admin'))
        expect(matching(filter, CUSTOMERS)).toEqual(['custA1', 'custA2', 'custB1', 'custB2', 'legacy'])
    })

    it("Admin does not reach another company's records", async () => {
        const filter = await getVisibleCustomerFilter(user('admin'))
        // Same company name on the record, but owned outside the tenant.
        expect(matching(filter, CUSTOMERS)).not.toContain('custOutside')
    })

    it('a User granted view-all-data matches the Admin exactly', async () => {
        const asAdmin = await getVisibleCustomerFilter(user('admin'))
        const asViewer = await getVisibleCustomerFilter(user('viewer'))
        expect(matching(asViewer, CUSTOMERS)).toEqual(matching(asAdmin, CUSTOMERS))
    })

    it("a Supervisor sees their own team's customers and not the other team's", async () => {
        const filter = await getVisibleCustomerFilter(user('supA'))
        const visible = matching(filter, CUSTOMERS)

        expect(visible).toEqual(['custA1', 'custA2', 'legacy'])
        expect(visible).not.toContain('custB1')
        expect(visible).not.toContain('custB2')
    })

    it('a User in a team with sharing switched off sees only their own', async () => {
        const filter = await getVisibleCustomerFilter(user('userA1'))
        expect(matching(filter, CUSTOMERS)).toEqual(['custA1', 'legacy'])
    })

    it("a User in a team with sharing switched on also sees teammates'", async () => {
        const filter = await getVisibleCustomerFilter(user('userB1'))
        expect(matching(filter, CUSTOMERS)).toEqual(['custB1', 'custB2', 'legacy'])
    })

    it('turning sharing on is what changes a plain User\'s reach', async () => {
        // The only difference between userA1 and userB1 is their team's flag.
        const closed = matching(await getVisibleCustomerFilter(user('userA1')), CUSTOMERS)
        const open = matching(await getVisibleCustomerFilter(user('userB1')), CUSTOMERS)
        expect(closed).toHaveLength(2)
        expect(open).toHaveLength(3)
    })
})

describe('deal scope by role', () => {
    it('Admin sees deals created anywhere inside their company', async () => {
        const filter = await getVisibleDealFilter(user('admin'))
        expect(matching(filter, DEALS)).toEqual(['dealA1', 'dealA2', 'dealB1'])
    })

    it("Admin does not reach another company's deals", async () => {
        const filter = await getVisibleDealFilter(user('admin'))
        expect(matching(filter, DEALS)).not.toContain('dealOutside')
    })

    it("a Supervisor sees their team members' deals", async () => {
        const filter = await getVisibleDealFilter(user('supA'))
        expect(matching(filter, DEALS)).toEqual(['dealA1', 'dealA2'])
    })

    it('a User sees only the deals they created', async () => {
        expect(matching(await getVisibleDealFilter(user('userA1')), DEALS)).toEqual(['dealA1'])
    })

    it('team sharing does not widen deal visibility, only customer visibility', async () => {
        // userB1's team has sharing on, yet deals stay scoped to the creator.
        const customers = matching(await getVisibleCustomerFilter(user('userB1')), CUSTOMERS)
        const deals = matching(await getVisibleDealFilter(user('userB1')), DEALS)

        expect(customers).toContain('custB2') // a teammate's customer
        expect(deals).toEqual(['dealB1']) // but not a teammate's deal
    })
})

describe('the filters are what the graph queries with', () => {
    it('every role produces a filter Mongo can run, never an empty or absent one', async () => {
        for (const id of ['admin', 'supA', 'supB', 'userA1', 'userB1', 'viewer']) {
            const customerFilter = await getVisibleCustomerFilter(user(id))
            const dealFilter = await getVisibleDealFilter(user(id))

            expect(customerFilter).toEqual(expect.any(Object))
            expect(Object.keys(customerFilter).length).toBeGreaterThan(0)
            expect(dealFilter).toEqual(expect.any(Object))
            expect(Object.keys(dealFilter).length).toBeGreaterThan(0)
        }
    })

    it('no role can see a record belonging to another tenant', async () => {
        for (const id of ['admin', 'supA', 'supB', 'userA1', 'userA2', 'userB1', 'userB2', 'viewer']) {
            const visible = matching(await getVisibleCustomerFilter(user(id)), CUSTOMERS)
            expect(visible).not.toContain('custOutside')

            const deals = matching(await getVisibleDealFilter(user(id)), DEALS)
            expect(deals).not.toContain('dealOutside')
        }
    })
})
