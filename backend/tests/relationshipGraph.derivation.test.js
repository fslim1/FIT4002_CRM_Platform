// The pure derivation service.
//
// Everything here runs without a database: buildGraph takes plain objects, so
// the graph's shape is provable on its own. Behaviour that belongs to the
// aggregation pipeline, meaning which interactions fall inside the 90-day
// window and which records the viewer may see at all, is proven by the query and
// access-control suites instead.

const fs = require('fs')
const path = require('path')

const {
    WINDOW_DAYS,
    MAX_NODES,
    BANDS,
    STAGE_ORDER,
    normaliseKey,
    accountKey,
    bandFor,
    cutoffFrom,
    buildGraph,
} = require('../services/relationshipGraph')

// --- Fixtures --------------------------------------------------------------

const contact = (id, overrides = {}) => ({
    _id: id,
    fullName: `Contact ${id}`,
    company: 'TranXenergy',
    designation: 'Procurement Lead',
    department: 'Procurement',
    owner: null,
    interactionCount: 0,
    lastInteractionAt: null,
    ...overrides,
})

const deal = (id, overrides = {}) => ({
    _id: id,
    name: `Deal ${id}`,
    company: 'TranXenergy',
    customer: '',
    stage: 'Qualified',
    createdBy: null,
    ...overrides,
})

const user = (id, fullName) => ({_id: id, fullName})

const nodesOfKind = (graph, kind) => graph.nodes.filter((n) => n.data.kind === kind)
const edgesOfKind = (graph, kind) => graph.edges.filter((e) => e.data.kind === kind)
const nodeIds = (graph) => graph.nodes.map((n) => n.data.id)
const noticeCodes = (graph) => graph.notices.map((n) => n.code)

// Asserted on every graph this file builds. A dangling edge would let a viewer
// infer a record outside their scope, so it is checked everywhere rather
// than in one dedicated test.
const expectNoDanglingEdges = (graph) => {
    const ids = new Set(nodeIds(graph))
    for (const edge of graph.edges) {
        expect(ids.has(edge.data.source)).toBe(true)
        expect(ids.has(edge.data.target)).toBe(true)
    }
}

const build = (input) => {
    const graph = buildGraph(input)
    expectNoDanglingEdges(graph)
    return graph
}

// --- The service stays pure -----------------------------------------------

describe('the service is pure', () => {
    const source = fs.readFileSync(
        path.join(__dirname, '..', 'services', 'relationshipGraph.js'),
        'utf8'
    )

    it('imports neither Express nor Mongoose', () => {
        expect(source).not.toMatch(/require\(['"]mongoose['"]\)/)
        expect(source).not.toMatch(/require\(['"]express['"]\)/)
        // No requires at all, in fact. It takes plain objects.
        expect(source).not.toMatch(/^\s*(const|let|var).*=\s*require\(/m)
    })

    it('does not mutate its inputs', () => {
        const input = {
            focusContact: contact('c1', {fullName: 'Jane Doe', interactionCount: 7}),
            contacts: [contact('c1', {fullName: 'Jane Doe', interactionCount: 7}), contact('c2')],
            deals: [deal('d1', {customer: 'Jane Doe', createdBy: 'u1'})],
            users: [user('u1', 'Sam Rep')],
        }
        const before = JSON.stringify(input)
        build(input)
        expect(JSON.stringify(input)).toBe(before)
    })

    it('STAGE_ORDER matches the Deal model enum', () => {
        // The service cannot import the model, so guard against drift here.
        const Deal = require('../models/Deal')
        expect(STAGE_ORDER).toEqual(Deal.schema.path('stage').enumValues)
    })
})

// --- : grouping contacts into one account --------------------------------

describe('company normalisation', () => {
    it('treats case and surrounding whitespace as the same account', () => {
        const keys = ['TranXenergy', ' tranxenergy ', 'TRANXENERGY', '\tTranXenergy\n'].map(accountKey)
        expect(new Set(keys).size).toBe(1)
        expect(keys[0]).toBe('tranxenergy')
    })

    it('treats a spelling variant as a separate account, not an error', () => {
        expect(accountKey('TranXenergy Pty')).not.toBe(accountKey('TranXenergy'))
    })

    it('does NOT collapse whitespace inside the name', () => {
        // Deliberate: the rule is "ignoring surrounding whitespace" only. Collapsing
        // inner whitespace would also put the query and this rule out of step.
        expect(accountKey('Tran  Xenergy')).not.toBe(accountKey('Tran Xenergy'))
    })

    it('handles null and undefined without throwing', () => {
        expect(normaliseKey(null)).toBe('')
        expect(normaliseKey(undefined)).toBe('')
        expect(normaliseKey('   ')).toBe('')
    })

    it('draws one company node with every contact connected to it', () => {
        const graph = build({
            focusContact: contact('c1'),
            contacts: [contact('c1'), contact('c2'), contact('c3')],
        })

        expect(nodesOfKind(graph, 'company')).toHaveLength(1)
        expect(nodesOfKind(graph, 'contact')).toHaveLength(3)
        expect(edgesOfKind(graph, 'employs')).toHaveLength(3)
        expect(graph.account.companyKey).toBe('tranxenergy')
    })

    it('labels the company node with the trimmed name as recorded', () => {
        const graph = build({focusContact: contact('c1', {company: '  TranXenergy  '})})
        expect(nodesOfKind(graph, 'company')[0].data.label).toBe('TranXenergy')
    })

    it('marks the focus contact and only the focus contact', () => {
        const graph = build({
            focusContact: contact('c1'),
            contacts: [contact('c1'), contact('c2')],
        })
        const focused = nodesOfKind(graph, 'contact').filter((n) => n.data.isFocus)
        expect(focused).toHaveLength(1)
        expect(focused[0].data.recordId).toBe('c1')
    })

    it('includes the focus contact even when the caller omits it', () => {
        // canViewCustomer and getVisibleCustomerFilter disagree for a customer
        // with no owner but a team, so the scope filter can miss a profile the
        // viewer is authorised to open. The graph must not lose its own subject.
        const graph = build({focusContact: contact('c1'), contacts: [contact('c2')]})
        expect(nodesOfKind(graph, 'contact').map((n) => n.data.recordId).sort()).toEqual(['c1', 'c2'])
    })

    it('does not duplicate the focus contact when the caller includes it', () => {
        const graph = build({focusContact: contact('c1'), contacts: [contact('c1')]})
        expect(nodesOfKind(graph, 'contact')).toHaveLength(1)
    })
})

// --- : deals drawn against their contacts --------------------------------

describe('deals', () => {
    it('matches a deal to a contact by name, case-insensitively', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: '  jane DOE  '})],
        })

        expect(nodesOfKind(graph, 'deal')).toHaveLength(1)
        const involved = edgesOfKind(graph, 'involved')
        expect(involved).toHaveLength(1)
        expect(involved[0].data.source).toBe('contact:c1')
        expect(involved[0].data.target).toBe('deal:d1')
        expect(involved[0].data.evidence).toBe('deal-customer')
    })

    it('shows the deal name and current stage on the node', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {name: 'Solar grid expansion', stage: 'Proposal Made', customer: 'Jane Doe'})],
        })
        const node = nodesOfKind(graph, 'deal')[0]
        expect(node.data.label).toBe('Solar grid expansion')
        expect(node.data.stage).toBe('Proposal Made')
        expect(node.data.recordId).toBe('d1')
    })

    it('lists a deal that matches no contact rather than dropping it', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d9', {name: 'EV charging pilot', customer: 'R. Patel', stage: 'Qualified'})],
        })

        expect(nodesOfKind(graph, 'deal')).toHaveLength(0)
        expect(graph.unmatchedDeals).toEqual([
            {
                id: 'd9',
                name: 'EV charging pilot',
                stage: 'Qualified',
                company: 'TranXenergy',
                customerName: 'R. Patel',
                reason: 'no-contact-match',
            },
        ])
    })

    it('treats a deal with no customer recorded as unmatched', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: ''})],
        })
        expect(graph.unmatchedDeals).toHaveLength(1)
        expect(nodesOfKind(graph, 'deal')).toHaveLength(0)
    })

    it('never matches a contact whose own name is blank', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: '   '}),
            deals: [deal('d1', {customer: ''})],
        })
        expect(graph.unmatchedDeals).toHaveLength(1)
        expect(edgesOfKind(graph, 'involved')).toHaveLength(0)
    })

    it('draws a deal against both contacts when two share a name', () => {
        // The graph shows the ambiguity rather than silently picking one.
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            contacts: [contact('c1', {fullName: 'Jane Doe'}), contact('c2', {fullName: 'jane doe'})],
            deals: [deal('d1', {customer: 'Jane Doe'})],
        })

        expect(edgesOfKind(graph, 'involved')).toHaveLength(2)
        expect(nodesOfKind(graph, 'deal')[0].data.contactCount).toBe(2)
    })

    it('records contactCount on the deal node for a single-threaded warning to build on', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: 'Jane Doe'})],
        })
        expect(nodesOfKind(graph, 'deal')[0].data.contactCount).toBe(1)
    })

    it('keeps the deal company on the node, which can differ from the account', () => {
        // A deal reaches the account through its customer name even when its own
        // company was typed differently; the panel can surface that.
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {company: 'TranXenergy Pty', customer: 'Jane Doe'})],
        })
        expect(nodesOfKind(graph, 'deal')[0].data.company).toBe('TranXenergy Pty')
    })
})

// --- Additional deal-to-contact links --------------------------------------

describe('deals linked by records other than the customer field', () => {
    it('connects a deal to a contact named only by a supplied link', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            contacts: [contact('c1', {fullName: 'Jane Doe'}), contact('c2', {fullName: 'Ravi Patel'})],
            deals: [deal('d1', {customer: 'Jane Doe'})],
            dealContactLinks: [{deal: 'd1', contact: 'c2'}],
        })

        expect(nodesOfKind(graph, 'deal')[0].data.contactCount).toBe(2)
        expect(edgesOfKind(graph, 'involved')).toHaveLength(2)
    })

    it('says how each connection was reached', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            contacts: [contact('c1', {fullName: 'Jane Doe'}), contact('c2', {fullName: 'Ravi Patel'})],
            deals: [deal('d1', {customer: 'Jane Doe'})],
            dealContactLinks: [{deal: 'd1', contact: 'c2'}],
        })

        const byTarget = Object.fromEntries(
            edgesOfKind(graph, 'involved').map((e) => [e.data.source, e.data.evidence])
        )
        expect(byTarget['contact:c1']).toBe('deal-customer')
        expect(byTarget['contact:c2']).toBe('linked-record')
    })

    it('draws a deal whose only connection comes from a link', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: 'Nobody Known'})],
            dealContactLinks: [{deal: 'd1', contact: 'c1'}],
        })

        expect(nodesOfKind(graph, 'deal')).toHaveLength(1)
        expect(graph.unmatchedDeals).toHaveLength(0)
    })

    it('ignores a link naming a contact outside the account', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: 'Jane Doe'})],
            dealContactLinks: [{deal: 'd1', contact: 'not-in-this-account'}],
        })

        expect(nodesOfKind(graph, 'deal')[0].data.contactCount).toBe(1)
        expect(edgesOfKind(graph, 'involved')).toHaveLength(1)
    })

    it('counts a contact once when both the name and a link point at it', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: 'Jane Doe'})],
            dealContactLinks: [{deal: 'd1', contact: 'c1'}],
        })

        expect(nodesOfKind(graph, 'deal')[0].data.contactCount).toBe(1)
        expect(edgesOfKind(graph, 'involved')).toHaveLength(1)
    })

    it('accepts dealId and contactId as alternative key names', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: 'Nobody Known'})],
            dealContactLinks: [{dealId: 'd1', contactId: 'c1'}],
        })
        expect(nodesOfKind(graph, 'deal')).toHaveLength(1)
    })

    it('tolerates malformed or empty links', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: 'Jane Doe'})],
            dealContactLinks: [null, undefined, {}, {deal: 'd1'}, {contact: 'c1'}],
        })
        expect(nodesOfKind(graph, 'deal')[0].data.contactCount).toBe(1)
    })

    it('behaves exactly as before when no links are supplied', () => {
        const withoutLinks = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: 'Jane Doe'})],
        })
        const withEmptyLinks = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: 'Jane Doe'})],
            dealContactLinks: [],
        })
        expect(withEmptyLinks).toEqual(withoutLinks)
    })
})

// --- Salespeople -----------------------------------------------------------

describe('salespeople', () => {
    it('draws the customer owner and the deal creator as salesperson nodes', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe', owner: 'u1'}),
            deals: [deal('d1', {customer: 'Jane Doe', createdBy: 'u2'})],
            users: [user('u1', 'Sam Rep'), user('u2', 'Alex Closer')],
        })

        expect(nodesOfKind(graph, 'salesperson').map((n) => n.data.label).sort()).toEqual([
            'Alex Closer',
            'Sam Rep',
        ])
        expect(edgesOfKind(graph, 'owns')).toHaveLength(1)
        expect(edgesOfKind(graph, 'created')).toHaveLength(1)
    })

    it('connects one salesperson to every contact and deal they are responsible for', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe', owner: 'u1'}),
            contacts: [
                contact('c1', {fullName: 'Jane Doe', owner: 'u1'}),
                contact('c2', {fullName: 'Ravi Patel', owner: 'u1'}),
            ],
            deals: [
                deal('d1', {customer: 'Jane Doe', createdBy: 'u1'}),
                deal('d2', {customer: 'Ravi Patel', createdBy: 'u1'}),
            ],
            users: [user('u1', 'Sam Rep')],
        })

        expect(nodesOfKind(graph, 'salesperson')).toHaveLength(1)
        expect(edgesOfKind(graph, 'owns')).toHaveLength(2)
        expect(edgesOfKind(graph, 'created')).toHaveLength(2)
    })

    it('draws a contact with no owner, without a salesperson connection', () => {
        const graph = build({focusContact: contact('c1', {owner: null}), users: []})
        expect(nodesOfKind(graph, 'contact')).toHaveLength(1)
        expect(nodesOfKind(graph, 'salesperson')).toHaveLength(0)
        expect(edgesOfKind(graph, 'owns')).toHaveLength(0)
    })

    it('drops an owner that could not be resolved rather than inventing a node', () => {
        // e.g. the owning user was deleted. No node, no edge, no error.
        const graph = build({focusContact: contact('c1', {owner: 'ghost'}), users: []})
        expect(nodesOfKind(graph, 'salesperson')).toHaveLength(0)
        expect(edgesOfKind(graph, 'owns')).toHaveLength(0)
    })

    it('emits four visually distinct node kinds for the stylesheet to draw', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe', owner: 'u1'}),
            deals: [deal('d1', {customer: 'Jane Doe', createdBy: 'u1'})],
            users: [user('u1', 'Sam Rep')],
        })
        expect(new Set(graph.nodes.map((n) => n.data.kind))).toEqual(
            new Set(['company', 'contact', 'deal', 'salesperson'])
        )
    })
})

// --- Interaction bands -----------------------------------------------------

describe('interaction bands', () => {
    it.each([
        [0, 'none'],
        [1, 'some'],
        [2, 'some'],
        [4, 'some'],
        [5, 'frequent'],
        [50, 'frequent'],
    ])('a count of %i falls in the %s band', (count, expected) => {
        expect(bandFor(count)).toBe(expected)
    })

    it('treats missing or nonsensical counts as no contact', () => {
        expect(bandFor(undefined)).toBe('none')
        expect(bandFor(null)).toBe('none')
        expect(bandFor(-3)).toBe('none')
        expect(bandFor(NaN)).toBe('none')
    })

    it('derives bands from the exported BANDS constant, so the legend cannot drift', () => {
        expect(BANDS.map((b) => b.key)).toEqual(['none', 'some', 'frequent'])
        for (const band of BANDS) {
            expect(bandFor(band.min)).toBe(band.key)
            if (band.max !== null) expect(bandFor(band.max)).toBe(band.key)
        }
    })

    it('carries the band, count and last interaction on the company-to-contact edge', () => {
        const when = new Date('2026-09-02T10:00:00.000Z')
        const graph = build({
            focusContact: contact('c1', {interactionCount: 7, lastInteractionAt: when}),
        })
        const edge = edgesOfKind(graph, 'employs')[0].data
        expect(edge.band).toBe('frequent')
        expect(edge.interactionCount).toBe(7)
        expect(edge.lastInteractionAt).toBe('2026-09-02T10:00:00.000Z')
    })

    it('exposes the window used, and a cutoff exactly that many days back', () => {
        expect(WINDOW_DAYS).toBe(90)
        const now = new Date('2026-09-20T00:00:00.000Z')
        expect(cutoffFrom(now).toISOString()).toBe('2026-06-22T00:00:00.000Z')
        const days = (now - cutoffFrom(now)) / (24 * 60 * 60 * 1000)
        expect(days).toBe(90)
    })

    it('reports a null last interaction rather than a bogus date', () => {
        const graph = build({focusContact: contact('c1', {lastInteractionAt: null})})
        expect(edgesOfKind(graph, 'employs')[0].data.lastInteractionAt).toBeNull()
        expect(nodesOfKind(graph, 'contact')[0].data.lastInteractionAt).toBeNull()
    })
})

// --- : small and empty accounts ----------------------------------------

describe('sparse and empty accounts', () => {
    it('draws a contact with no company as a single node with an explanation', () => {
        const graph = build({
            focusContact: contact('c1', {company: '   '}),
            contacts: [contact('c2')],
            deals: [deal('d1')],
        })

        expect(graph.nodes).toHaveLength(1)
        expect(graph.nodes[0].data.kind).toBe('contact')
        expect(graph.edges).toHaveLength(0)
        expect(graph.account.hasCompany).toBe(false)
        expect(noticeCodes(graph)).toEqual(['no-company'])
    })

    it('notes that nothing else is recorded for a single contact with no deals', () => {
        const graph = build({focusContact: contact('c1'), contacts: [contact('c1')], deals: []})

        expect(graph.nodes).toHaveLength(2) // the company and the one contact
        expect(noticeCodes(graph)).toContain('sparse-account')
    })

    it('does not call an account sparse when an unmatched deal exists', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: 'Someone Else'})],
        })
        expect(noticeCodes(graph)).not.toContain('sparse-account')
        expect(graph.unmatchedDeals).toHaveLength(1)
    })

    it('draws every connection in the lowest band when nothing was logged', () => {
        const graph = build({
            focusContact: contact('c1', {interactionCount: 0}),
            contacts: [contact('c1', {interactionCount: 0}), contact('c2', {interactionCount: 0})],
        })

        expect(edgesOfKind(graph, 'employs').every((e) => e.data.band === 'none')).toBe(true)
        expect(noticeCodes(graph)).toContain('no-recent-interactions')
    })

    it('does not claim silence when any contact has been in touch', () => {
        const graph = build({
            focusContact: contact('c1', {interactionCount: 0}),
            contacts: [contact('c1', {interactionCount: 0}), contact('c2', {interactionCount: 1})],
        })
        expect(noticeCodes(graph)).not.toContain('no-recent-interactions')
    })
})

// --- : the node cap -----------------------------------------------------

describe('node cap', () => {
    const manyContacts = (n) =>
        Array.from({length: n}, (_, i) =>
            contact(`c${i}`, {fullName: `Contact ${i}`, interactionCount: i})
        )

    it('caps the drawn nodes and says so', () => {
        const contacts = manyContacts(200)
        const graph = build({focusContact: contacts[0], contacts})

        expect(graph.nodes.length).toBeLessThanOrEqual(MAX_NODES)
        expect(graph.meta.capped).toBe(true)
        expect(noticeCodes(graph)).toContain('capped')
        expect(graph.meta.omitted.contacts).toBe(200 - nodesOfKind(graph, 'contact').length)
    })

    it('always keeps the company node and the focus contact', () => {
        const contacts = manyContacts(200)
        // The focus contact is the least active, so ranking alone would cut it.
        const graph = build({focusContact: contacts[0], contacts, maxNodes: 10})

        expect(nodesOfKind(graph, 'company')).toHaveLength(1)
        const focused = nodesOfKind(graph, 'contact').filter((n) => n.data.isFocus)
        expect(focused).toHaveLength(1)
        expect(focused[0].data.recordId).toBe('c0')
    })

    it('keeps the most active contacts', () => {
        const contacts = manyContacts(10)
        const graph = build({focusContact: contacts[0], contacts, maxNodes: 4})

        const kept = nodesOfKind(graph, 'contact').map((n) => n.data.recordId)
        // 4 nodes = company + focus (c0) + the two busiest others (c9, c8).
        expect(kept).toEqual(['c0', 'c9', 'c8'])
    })

    it('reports nothing omitted and no notice when everything fits', () => {
        const contacts = manyContacts(5)
        const graph = build({focusContact: contacts[0], contacts})

        expect(graph.meta.capped).toBe(false)
        expect(graph.meta.omitted).toEqual({contacts: 0, deals: 0, salespeople: 0})
        expect(noticeCodes(graph)).not.toContain('capped')
    })

    it('never emits a deal whose contacts were all cut', () => {
        const contacts = manyContacts(10)
        const graph = build({
            focusContact: contacts[0],
            contacts,
            // Recorded against a contact that the cap removes.
            deals: [deal('d1', {customer: 'Contact 5'})],
            maxNodes: 4,
        })

        expect(nodesOfKind(graph, 'deal')).toHaveLength(0)
        expect(graph.meta.omitted.deals).toBe(1)
    })

    it('prefers open deals and later pipeline stages when space is tight', () => {
        const dealsInPlay = [
            deal('won', {customer: 'Jane Doe', stage: 'Won'}),
            deal('qualified', {customer: 'Jane Doe', stage: 'Qualified'}),
            deal('negotiation', {customer: 'Jane Doe', stage: 'Negotiation'}),
        ]
        const drawnWithCap = (maxNodes) =>
            nodesOfKind(
                build({focusContact: contact('c1', {fullName: 'Jane Doe'}), deals: dealsInPlay, maxNodes}),
                'deal'
            ).map((n) => n.data.recordId)

        // The budget is company + focus contact + however many deals are left.
        expect(drawnWithCap(3)).toEqual(['negotiation'])
        expect(drawnWithCap(4)).toEqual(['negotiation', 'qualified'])
        // Closed deals are given up first, so Won only appears once all fit.
        expect(drawnWithCap(5)).toEqual(['negotiation', 'qualified', 'won'])
    })

    it('reports omitted deals accurately as the cap tightens', () => {
        const dealsInPlay = [
            deal('a', {customer: 'Jane Doe', stage: 'Negotiation'}),
            deal('b', {customer: 'Jane Doe', stage: 'Qualified'}),
            deal('c', {customer: 'Jane Doe', stage: 'Won'}),
        ]
        const omittedWithCap = (maxNodes) =>
            build({focusContact: contact('c1', {fullName: 'Jane Doe'}), deals: dealsInPlay, maxNodes})
                .meta.omitted.deals

        expect(omittedWithCap(3)).toBe(2)
        expect(omittedWithCap(4)).toBe(1)
        expect(omittedWithCap(5)).toBe(0)
    })

    it('still lists unmatched deals when the graph is capped', () => {
        const contacts = manyContacts(200)
        const graph = build({
            focusContact: contacts[0],
            contacts,
            deals: [deal('d9', {customer: 'Nobody Here'})],
        })
        expect(graph.unmatchedDeals).toHaveLength(1)
    })
})

// --- Robustness against malformed input ------------------------------------

describe('robustness', () => {
    it('collapses a deal that arrives twice into one node', () => {
        // Two nodes sharing an id would be rejected by Cytoscape outright.
        const twice = deal('d1', {customer: 'Jane Doe'})
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe'}),
            deals: [twice, {...twice}],
        })

        expect(nodesOfKind(graph, 'deal')).toHaveLength(1)
        expect(edgesOfKind(graph, 'involved')).toHaveLength(1)
        const ids = nodeIds(graph)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('collapses a contact that arrives twice into one node', () => {
        const graph = build({
            focusContact: contact('c1'),
            contacts: [contact('c1'), contact('c1'), contact('c2')],
        })
        expect(nodesOfKind(graph, 'contact')).toHaveLength(2)
    })

    it('ranks deterministically when a last-interaction date is unusable', () => {
        // An unusable date must not reach the sort comparator as NaN, which
        // would make the cap cut different records on different runs.
        const broken = (i) =>
            contact(`c${i}`, {fullName: `Contact ${i}`, interactionCount: 1, lastInteractionAt: 'not-a-date'})
        const contacts = [broken(0), broken(1), broken(2)]
        const run = () =>
            nodesOfKind(build({focusContact: contacts[0], contacts, maxNodes: 3}), 'contact')
                .map((n) => n.data.recordId)

        expect(run()).toEqual(run())
        expect(run()).toEqual(['c0', 'c1'])
    })

    it('reports a null last interaction when the stored date is unusable', () => {
        const graph = build({focusContact: contact('c1', {lastInteractionAt: 'not-a-date'})})
        expect(nodesOfKind(graph, 'contact')[0].data.lastInteractionAt).toBeNull()
    })

    it('keeps a node count and its band describing the same number', () => {
        // Counts arrive from an aggregation, but nothing downstream should be
        // able to show "5 interactions" next to a "no contact" band.
        for (const raw of [5, '5', 5.7, 0, '0', null, undefined, -2, NaN]) {
            const node = nodesOfKind(build({focusContact: contact('c1', {interactionCount: raw})}), 'contact')[0]
            expect(node.data.band).toBe(bandFor(node.data.interactionCount))
            expect(Number.isInteger(node.data.interactionCount)).toBe(true)
            expect(node.data.interactionCount).toBeGreaterThanOrEqual(0)
        }
    })

    it('reports a salesperson lost to the cap rather than leaving records unattributed', () => {
        const graph = build({
            focusContact: contact('c1', {owner: 'u1'}),
            users: [user('u1', 'Sam Rep')],
            maxNodes: 2, // only the company and the focus contact fit
        })

        expect(nodesOfKind(graph, 'salesperson')).toHaveLength(0)
        expect(graph.meta.omitted.salespeople).toBe(1)
        expect(graph.meta.capped).toBe(true)
        expect(noticeCodes(graph)).toContain('capped')
    })

    it('ranks contacts by the same count it displays', () => {
        // A count of -1 and a count of 0 both display as 0, so neither may be
        // ranked ahead of the other on the strength of the raw stored value.
        const graph = build({
            focusContact: contact('focus', {interactionCount: 2}),
            contacts: [
                contact('focus', {interactionCount: 2}),
                contact('negative', {fullName: 'A', interactionCount: -1}),
                contact('zero', {fullName: 'B', interactionCount: 0}),
            ],
            maxNodes: 3, // company + focus + one of the two
        })
        // Both normalise to 0, so the name tie-break decides: 'A' wins.
        expect(nodesOfKind(graph, 'contact').map((n) => n.data.recordId)).toEqual(['focus', 'negative'])
    })

    it('does not count an unresolvable owner as an omitted salesperson', () => {
        // Nothing was dropped for space; there was simply no user to draw.
        const graph = build({focusContact: contact('c1', {owner: 'ghost'}), users: []})
        expect(graph.meta.omitted.salespeople).toBe(0)
        expect(graph.meta.capped).toBe(false)
    })

    it('tolerates a company that is not a string', () => {
        const graph = build({focusContact: contact('c1', {company: null})})
        expect(graph.account.hasCompany).toBe(false)
        expect(noticeCodes(graph)).toEqual(['no-company'])
    })

    it('accepts ids as ObjectId-like objects as well as strings', () => {
        const objectIdLike = {toString: () => '507f1f77bcf86cd799439011'}
        const graph = build({
            focusContact: contact(objectIdLike, {fullName: 'Jane Doe'}),
            deals: [deal('d1', {customer: 'Jane Doe'})],
        })
        expect(nodesOfKind(graph, 'contact')[0].data.recordId).toBe('507f1f77bcf86cd799439011')
        expect(edgesOfKind(graph, 'involved')[0].data.source).toBe('contact:507f1f77bcf86cd799439011')
    })
})

// --- Invariants under randomised input -------------------------------------

describe('invariants hold across randomised inputs', () => {
    // Seeded so a failure is reproducible rather than a once-in-a-while flake.
    const mulberry32 = (seed) => () => {
        seed |= 0
        seed = (seed + 0x6d2b79f5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }

    const NAMES = ['Jane Doe', 'jane doe', 'Ravi Patel', '  RAVI PATEL  ', 'Sam Rep', '']
    const COMPANIES = ['TranXenergy', ' tranxenergy ', 'TranXenergy Pty', '']
    const DATES = [null, 'not-a-date', new Date('2026-09-01T00:00:00Z'), new Date('2020-01-01T00:00:00Z')]
    const COUNTS = [0, 1, 4, 5, 40, null, undefined, '3', -1]

    it('never produces a dangling edge, a duplicate id, or a miscounted meta', () => {
        const rand = mulberry32(20260920)
        const pick = (list) => list[Math.floor(rand() * list.length)]

        for (let run = 0; run < 400; run++) {
            const contactCount = Math.floor(rand() * 8)
            const contacts = Array.from({length: contactCount}, (_, i) =>
                contact(`c${i}`, {
                    fullName: pick(NAMES),
                    company: pick(COMPANIES),
                    owner: rand() < 0.5 ? pick(['u1', 'u2', 'ghost']) : null,
                    interactionCount: pick(COUNTS),
                    lastInteractionAt: pick(DATES),
                })
            )
            const deals = Array.from({length: Math.floor(rand() * 6)}, (_, i) =>
                deal(`d${i}`, {
                    customer: pick(NAMES),
                    company: pick(COMPANIES),
                    stage: pick([...STAGE_ORDER, null, 'Unknown Stage']),
                    createdBy: rand() < 0.5 ? pick(['u1', 'u2', 'ghost']) : null,
                })
            )
            const focus = contact('focus', {
                fullName: pick(NAMES),
                company: pick(COMPANIES),
                owner: rand() < 0.5 ? 'u1' : null,
                interactionCount: pick(COUNTS),
                lastInteractionAt: pick(DATES),
            })
            const maxNodes = 1 + Math.floor(rand() * 14)

            const graph = buildGraph({
                focusContact: focus,
                contacts,
                deals,
                users: [user('u1', 'Sam Rep'), user('u2', 'Alex Closer')],
                maxNodes,
            })

            const ids = graph.nodes.map((n) => n.data.id)
            const idSet = new Set(ids)

            // No duplicate node ids.
            expect(idSet.size).toBe(ids.length)

            // No dangling edges: nothing outside the node set is implied.
            for (const edge of graph.edges) {
                expect(idSet.has(edge.data.source)).toBe(true)
                expect(idSet.has(edge.data.target)).toBe(true)
            }

            // Edge ids are unique too.
            const edgeIds = graph.edges.map((e) => e.data.id)
            expect(new Set(edgeIds).size).toBe(edgeIds.length)

            // meta.counts always describes what was actually drawn.
            expect(graph.meta.counts.contacts).toBe(nodesOfKind(graph, 'contact').length)
            expect(graph.meta.counts.deals).toBe(nodesOfKind(graph, 'deal').length)
            expect(graph.meta.counts.salespeople).toBe(nodesOfKind(graph, 'salesperson').length)
            expect(graph.meta.counts.unmatchedDeals).toBe(graph.unmatchedDeals.length)

            // Omissions are never negative, and `capped` agrees with them.
            for (const value of Object.values(graph.meta.omitted)) {
                expect(value).toBeGreaterThanOrEqual(0)
            }
            expect(graph.meta.capped).toBe(Object.values(graph.meta.omitted).some((v) => v > 0))

            // The cap holds, except for the company node and focus contact,
            // which are kept deliberately even when the budget is tiny.
            expect(graph.nodes.length).toBeLessThanOrEqual(Math.max(maxNodes, 2))

            // The focus contact is always drawn, and exactly once.
            const focused = nodesOfKind(graph, 'contact').filter((n) => n.data.isFocus)
            expect(focused).toHaveLength(1)

            // Every drawn deal has at least one contact edge; a deal node with
            // no relationship on it would be meaningless.
            for (const node of nodesOfKind(graph, 'deal')) {
                expect(node.data.contactCount).toBeGreaterThan(0)
            }
        }
    })
})

// --- Response contract -----------------------------------------------------

describe('response contract', () => {
    it('reports counts matching what was actually drawn', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe', owner: 'u1'}),
            contacts: [contact('c1', {fullName: 'Jane Doe', owner: 'u1'}), contact('c2')],
            deals: [deal('d1', {customer: 'Jane Doe', createdBy: 'u1'}), deal('d2', {customer: 'Ghost'})],
            users: [user('u1', 'Sam Rep')],
        })

        expect(graph.meta.counts).toEqual({
            contacts: 2,
            deals: 1,
            salespeople: 1,
            unmatchedDeals: 1,
        })
        expect(graph.meta.counts.contacts).toBe(nodesOfKind(graph, 'contact').length)
        expect(graph.meta.counts.deals).toBe(nodesOfKind(graph, 'deal').length)
        expect(graph.meta.counts.salespeople).toBe(nodesOfKind(graph, 'salesperson').length)
    })

    it('gives every node and edge a unique id', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe', owner: 'u1'}),
            contacts: [contact('c1', {fullName: 'Jane Doe', owner: 'u1'}), contact('c2', {owner: 'u1'})],
            deals: [deal('d1', {customer: 'Jane Doe', createdBy: 'u1'})],
            users: [user('u1', 'Sam Rep')],
        })

        const ids = [...nodeIds(graph), ...graph.edges.map((e) => e.data.id)]
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('serialises to JSON without losing anything', () => {
        const graph = build({
            focusContact: contact('c1', {fullName: 'Jane Doe', interactionCount: 3, owner: 'u1'}),
            deals: [deal('d1', {customer: 'Jane Doe', createdBy: 'u1'})],
            users: [user('u1', 'Sam Rep')],
        })
        expect(JSON.parse(JSON.stringify(graph))).toEqual(graph)
    })

    it('rejects a call with no focus contact rather than returning a half graph', () => {
        expect(() => buildGraph({})).toThrow(/focusContact/)
        expect(() => buildGraph({focusContact: {fullName: 'No id'}})).toThrow(/_id/)
    })
})
