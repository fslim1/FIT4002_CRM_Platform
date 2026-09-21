// The aggregation pipelines, exercised against mingo, a pure-JS implementation
// of MongoDB's query and aggregation language.
//
// WHAT THIS PROVES: the pipelines are well-formed and their logic is right,
// what matches, what does not, what is computed, and what is dropped from the
// payload.
//
// WHAT IT DOES NOT PROVE: that MongoDB agrees with mingo in every corner.
// $toLower is ASCII-defined in MongoDB, collation and BSON comparison order are
// the server's own, and mingo is a reimplementation. The database-backed suite
// in relationshipGraph.access.test.js is what confirms real-server behaviour;
// this suite is what makes a broken pipeline fail fast on any machine.

const {Aggregator} = require('mingo')

const {contactsPipeline, dealsPipeline} = require('../services/relationshipGraphQueries')
const {cutoffFrom} = require('../services/relationshipGraph')

const NOW = new Date('2026-09-20T00:00:00.000Z')
const CUTOFF = cutoffFrom(NOW) // 2026-06-22

const run = (pipeline, docs) => new Aggregator(pipeline).run(docs)
const ids = (rows) => rows.map((r) => r._id).sort()

const daysBefore = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

const customer = (id, overrides = {}) => ({
    _id: id,
    fullName: `Contact ${id}`,
    company: 'TranXenergy',
    designation: 'Procurement Lead',
    department: 'Procurement',
    owner: 'u1',
    team: 't1',
    phone: '0400000000',
    email: `${id}@example.com`,
    address: '1 Test Street',
    interactions: [],
    ...overrides,
})

const dealDoc = (id, overrides = {}) => ({
    _id: id,
    name: `Deal ${id}`,
    company: 'TranXenergy',
    customer: '',
    stage: 'Qualified',
    price: '1000',
    createdBy: 'u1',
    statusLogs: [],
    ...overrides,
})

// The filter shapes middleware/teamScope.js actually produces.
const SCOPE_ALL = {$or: [{owner: {$in: ['u1', 'u2']}}, {owner: null, team: null}]}
const SCOPE_OWN = {$or: [{owner: 'u1'}, {owner: null, team: null}]}
const DEAL_SCOPE_OWN = {createdBy: 'u1'}

// --- contactsPipeline ------------------------------------------------------

describe('contactsPipeline: account grouping', () => {
    const docs = [
        customer('focus', {company: 'TranXenergy'}),
        customer('spaced', {company: '  tranxenergy  '}),
        customer('upper', {company: 'TRANXENERGY'}),
        customer('variant', {company: 'TranXenergy Pty'}),
        customer('other', {company: 'Northwind'}),
    ]

    const pipeline = contactsPipeline({
        scopeFilter: SCOPE_ALL,
        focusId: 'focus',
        companyRaw: 'TranXenergy',
        cutoff: CUTOFF,
    })

    it('groups case and surrounding whitespace variants into one account', () => {
        expect(ids(run(pipeline, docs))).toEqual(['focus', 'spaced', 'upper'])
    })

    it('treats a spelling variant as a different account', () => {
        expect(ids(run(pipeline, docs))).not.toContain('variant')
    })

    it('matches the account even when the focus profile itself stores padding', () => {
        const padded = contactsPipeline({
            scopeFilter: SCOPE_ALL,
            focusId: 'spaced',
            companyRaw: '  tranxenergy  ',
            cutoff: CUTOFF,
        })
        expect(ids(run(padded, docs))).toEqual(['focus', 'spaced', 'upper'])
    })

    it('emits a normalised nameKey for the deal query to match against', () => {
        const rows = run(pipeline, [customer('focus', {fullName: '  Jane DOE  '})])
        expect(rows[0].nameKey).toBe('jane doe')
    })
})

describe('contactsPipeline: access control', () => {
    const docs = [
        customer('mine', {owner: 'u1'}),
        customer('teammate', {owner: 'u2'}),
        customer('legacy', {owner: null, team: null}),
    ]

    it('returns only records the scope filter allows', () => {
        const pipeline = contactsPipeline({
            scopeFilter: SCOPE_OWN,
            focusId: 'mine',
            companyRaw: 'TranXenergy',
            cutoff: CUTOFF,
        })
        expect(ids(run(pipeline, docs))).toEqual(['legacy', 'mine'])
    })

    it('widens the scope by the focus contact and nothing else', () => {
        // canViewCustomer can authorise a profile that getVisibleCustomerFilter
        // does not return; the graph must not omit its own subject. No other
        // out-of-scope record may enter through that clause.
        const outOfScopeFocus = customer('focus', {owner: 'someone-else', team: 't9'})
        const alsoOutOfScope = customer('hidden', {owner: 'someone-else', team: 't9'})

        const pipeline = contactsPipeline({
            scopeFilter: SCOPE_OWN,
            focusId: 'focus',
            companyRaw: 'TranXenergy',
            cutoff: CUTOFF,
        })

        const rows = run(pipeline, [...docs, outOfScopeFocus, alsoOutOfScope])
        expect(ids(rows)).toContain('focus')
        expect(ids(rows)).not.toContain('hidden')
    })
})

describe('contactsPipeline: interaction counting', () => {
    const withInteractions = (interactions) =>
        run(
            contactsPipeline({
                scopeFilter: SCOPE_ALL,
                focusId: 'focus',
                companyRaw: 'TranXenergy',
                cutoff: CUTOFF,
            }),
            [customer('focus', {interactions})]
        )[0]

    it('counts an interaction inside the window and excludes one outside it', () => {
        const row = withInteractions([
            {type: 'Note', date: daysBefore(89)},
            {type: 'Note', date: daysBefore(91)},
        ])
        expect(row.interactionCount).toBe(1)
    })

    it('includes an interaction exactly on the boundary', () => {
        expect(withInteractions([{type: 'Note', date: CUTOFF}]).interactionCount).toBe(1)
    })

    it('counts all four interaction types the CRM records', () => {
        const row = withInteractions(
            ['Email', 'Call', 'Task', 'Note'].map((type) => ({type, date: daysBefore(10)}))
        )
        expect(row.interactionCount).toBe(4)
    })

    it('reports the most recent interaction even when it predates the window', () => {
        const row = withInteractions([{type: 'Note', date: daysBefore(400)}])
        expect(row.interactionCount).toBe(0)
        expect(new Date(row.lastInteractionAt).toISOString()).toBe(daysBefore(400).toISOString())
    })

    it('handles a contact with no interactions at all', () => {
        const row = withInteractions([])
        expect(row.interactionCount).toBe(0)
        expect(row.lastInteractionAt).toBeNull()
    })

    it('handles a contact whose interactions field is missing entirely', () => {
        const rows = run(
            contactsPipeline({
                scopeFilter: SCOPE_ALL,
                focusId: 'focus',
                companyRaw: 'TranXenergy',
                cutoff: CUTOFF,
            }),
            [(() => {
                const c = customer('focus');
                delete c.interactions;
                return c
            })()]
        )
        expect(rows[0].interactionCount).toBe(0)
        expect(rows[0].lastInteractionAt).toBeNull()
    })

    it('never ships the interactions array itself', () => {
        // The embedded array is unbounded; shipping it would dominate the
        // payload and expose interaction bodies the graph has no use for.
        const row = withInteractions([{type: 'Note', details: 'private notes', date: daysBefore(1)}])
        expect(row.interactions).toBeUndefined()
        expect(JSON.stringify(row)).not.toContain('private notes')
    })

    it('projects only the fields the graph needs', () => {
        const row = withInteractions([])
        expect(Object.keys(row).sort()).toEqual([
            '_id',
            'company',
            'department',
            'designation',
            'fullName',
            'interactionCount',
            'lastInteractionAt',
            'nameKey',
            'owner',
        ])
        // Contact details the graph never draws stay out of the response.
        expect(row.phone).toBeUndefined()
        expect(row.email).toBeUndefined()
        expect(row.address).toBeUndefined()
    })
})

describe('contactsPipeline: a contact with no company', () => {
    const docs = [
        customer('focus', {company: '   '}),
        customer('alsoBlank', {company: ''}),
        customer('named', {company: 'TranXenergy'}),
    ]

    it('returns the focus contact alone rather than grouping every blank company', () => {
        // Two contacts that both lack a company are not colleagues; they are
        // unrelated records that happen to share a gap.
        const pipeline = contactsPipeline({
            scopeFilter: SCOPE_ALL,
            focusId: 'focus',
            companyRaw: '   ',
            cutoff: CUTOFF,
        })
        expect(ids(run(pipeline, docs))).toEqual(['focus'])
    })

    it('does the same when the company field is missing altogether', () => {
        const pipeline = contactsPipeline({
            scopeFilter: SCOPE_ALL,
            focusId: 'focus',
            companyRaw: undefined,
            cutoff: CUTOFF,
        })
        const noCompany = (() => {
            const c = customer('focus');
            delete c.company;
            return c
        })()
        expect(ids(run(pipeline, [noCompany, ...docs.slice(1)]))).toEqual(['focus'])
    })
})

// --- dealsPipeline ---------------------------------------------------------

describe('dealsPipeline', () => {
    const docs = [
        dealDoc('byCompany', {company: 'tranxenergy', customer: 'Nobody Known'}),
        dealDoc('byName', {company: 'Mistyped Co', customer: '  JANE doe  '}),
        dealDoc('both', {company: 'TranXenergy', customer: 'Jane Doe'}),
        dealDoc('neither', {company: 'Northwind', customer: 'Someone Else'}),
    ]
    const pipeline = dealsPipeline({
        scopeFilter: DEAL_SCOPE_OWN,
        companyRaw: 'TranXenergy',
        contactNameKeys: ['jane doe'],
    })

    it('matches a deal by its own company', () => {
        expect(ids(run(pipeline, docs))).toContain('byCompany')
    })

    it('matches a deal by the customer name recorded on it, case-insensitively', () => {
        // Reaches the account through its contact even though its company was
        // typed differently.
        expect(ids(run(pipeline, docs))).toContain('byName')
    })

    it('excludes a deal matching neither the company nor a known contact', () => {
        expect(ids(run(pipeline, docs))).not.toContain('neither')
    })

    it('returns each matching deal once, however many clauses it satisfies', () => {
        expect(ids(run(pipeline, docs))).toEqual(['byCompany', 'byName', 'both'].sort())
    })

    it('enforces the deal scope filter', () => {
        const mine = dealDoc('mine', {createdBy: 'u1'})
        const theirs = dealDoc('theirs', {createdBy: 'u2'})
        expect(ids(run(pipeline, [mine, theirs]))).toEqual(['mine'])
    })

    it('projects only the fields the graph needs', () => {
        const row = run(pipeline, [dealDoc('both', {customer: 'Jane Doe'})])[0]
        expect(Object.keys(row).sort()).toEqual([
            '_id',
            'company',
            'createdBy',
            'customer',
            'customerKey',
            'name',
            'stage',
        ])
        expect(row.price).toBeUndefined()
        expect(row.statusLogs).toBeUndefined()
    })

    it('matches on company alone when the account has no contact names yet', () => {
        const companyOnly = dealsPipeline({
            scopeFilter: DEAL_SCOPE_OWN,
            companyRaw: 'TranXenergy',
            contactNameKeys: [],
        })
        expect(ids(run(companyOnly, docs))).toEqual(['both', 'byCompany'])
    })

    it('returns nothing, without building an empty $or, when there is nothing to match', () => {
        // MongoDB rejects {$or: []}, so this case must not produce one.
        const nothing = dealsPipeline({scopeFilter: DEAL_SCOPE_OWN, companyRaw: '', contactNameKeys: []})
        expect(JSON.stringify(nothing)).not.toContain('"$or":[]')
        expect(run(nothing, docs)).toEqual([])
    })

    it('does not treat deals with a blank company as belonging to a blank account', () => {
        const blanks = [dealDoc('blank1', {company: '', customer: ''}), dealDoc('blank2', {
            company: '  ',
            customer: ''
        })]
        const noAccount = dealsPipeline({
            scopeFilter: DEAL_SCOPE_OWN,
            companyRaw: '   ',
            contactNameKeys: ['jane doe'],
        })
        expect(run(noAccount, blanks)).toEqual([])
    })
})

// --- Cross-checking the two pipelines agree --------------------------------

describe('the pipelines agree with the service on what one account is', () => {
    const {accountKey} = require('../services/relationshipGraph')

    it('produces nameKeys the service would produce for the same value', () => {
        const values = ['Jane Doe', '  JANE doe  ', 'Ravi Patel', '\tSam Rep\n']
        const rows = run(
            contactsPipeline({
                scopeFilter: SCOPE_ALL,
                focusId: 'c0',
                companyRaw: 'TranXenergy',
                cutoff: CUTOFF,
            }),
            values.map((fullName, i) => customer(`c${i}`, {fullName}))
        )

        for (const row of rows) {
            expect(row.nameKey).toBe(accountKey(row.fullName))
        }
    })

    it('groups exactly the companies the service considers one account', () => {
        const companies = ['TranXenergy', ' tranxenergy ', 'TRANXENERGY', 'TranXenergy Pty', 'Tran  Xenergy']
        const docs = companies.map((company, i) => customer(`c${i}`, {company}))
        const rows = run(
            contactsPipeline({
                scopeFilter: SCOPE_ALL,
                focusId: 'c0',
                companyRaw: 'TranXenergy',
                cutoff: CUTOFF,
            }),
            docs
        )

        const expected = docs
            .filter((d) => accountKey(d.company) === accountKey('TranXenergy'))
            .map((d) => d._id)
        expect(ids(rows)).toEqual(expected.sort())
    })
})
