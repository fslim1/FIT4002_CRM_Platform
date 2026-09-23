// The whole read path, over accounts that are not the one used to develop it.
//
// The platform is not tied to a single tenant, so the grouping and matching
// rules have to hold for any company name and any way a person's details
// happen to be typed. Each case here runs the real pipelines through mingo,
// feeds the rows into the real derivation exactly as the controller does, and
// asserts on the graph that comes out.
//
// The same caveat as relationshipGraph.queries.test.js applies: mingo is a
// JavaScript reimplementation, so this proves the logic rather than the
// server's own string handling.

const {Aggregator} = require('mingo')

const {contactsPipeline, dealsPipeline} = require('../services/relationshipGraphQueries')
const {buildGraph, cutoffFrom} = require('../services/relationshipGraph')

const NOW = new Date('2026-09-20T00:00:00.000Z')
const CUTOFF = cutoffFrom(NOW)
const SCOPE = {$or: [{owner: {$in: ['u1', 'u2', 'u3']}}, {owner: null, team: null}]}
const DEAL_SCOPE = {createdBy: {$in: ['u1', 'u2', 'u3']}}

const daysBefore = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

const touches = (count, from = 10) =>
    Array.from({length: count}, (_, i) => ({
        type: 'Call',
        details: `contact ${i}`,
        date: daysBefore(from + i),
    }))

const person = (id, fullName, company, overrides = {}) => ({
    _id: id,
    fullName,
    company,
    designation: 'Account Manager',
    department: 'Sales',
    owner: 'u1',
    team: 't1',
    interactions: [],
    ...overrides,
})

const deal = (id, name, company, customer, overrides = {}) => ({
    _id: id,
    name,
    company,
    customer,
    stage: 'Qualified',
    price: '1000',
    createdBy: 'u1',
    ...overrides,
})

// Mirrors the controller: contacts first, their database-computed name keys
// into the deal query, then both into the derivation.
const buildAccount = ({focusId, customers, deals = [], users = []}) => {
    const focus = customers.find((c) => c._id === focusId)
    if (!focus) throw new Error(`focus ${focusId} is not in the customer list`)

    const contactRows = new Aggregator(
        contactsPipeline({
            scopeFilter: SCOPE,
            focusId,
            companyRaw: focus.company,
            cutoff: CUTOFF,
        })
    ).run(customers)

    const contactNameKeys = [...new Set(contactRows.map((c) => c.nameKey).filter(Boolean))]

    const dealRows = new Aggregator(
        dealsPipeline({scopeFilter: DEAL_SCOPE, companyRaw: focus.company, contactNameKeys})
    ).run(deals)

    const focusContact = contactRows.find((c) => String(c._id) === String(focusId))
    return {
        contactRows,
        dealRows,
        graph: buildGraph({focusContact, contacts: contactRows, deals: dealRows, users}),
    }
}

const labelsOf = (graph, kind) =>
    graph.nodes.filter((n) => n.data.kind === kind).map((n) => n.data.label).sort()

const drawnDealNames = (graph) => labelsOf(graph, 'deal')

describe('a Japanese renewables account', () => {
    const customers = [
        person('c1', '川口 花子', '川口リニューアブルズ株式会社', {
            designation: '調達部長',
            interactions: touches(7),
        }),
        person('c2', '佐藤 健', '川口リニューアブルズ株式会社', {owner: 'u2'}),
        person('c3', 'Unrelated Person', 'Someone Else Ltd'),
    ]
    const deals = [
        deal('d1', '洋上風力プロジェクト', '川口リニューアブルズ株式会社', '川口 花子', {
            stage: 'Negotiation',
        }),
    ]

    it('groups colleagues and leaves other companies out', () => {
        const {graph} = buildAccount({focusId: 'c1', customers, deals})

        expect(labelsOf(graph, 'contact')).toEqual(['佐藤 健', '川口 花子'].sort())
        expect(labelsOf(graph, 'company')).toEqual(['川口リニューアブルズ株式会社'])
    })

    it('draws the deal against the contact named on it', () => {
        const {graph} = buildAccount({focusId: 'c1', customers, deals})

        expect(drawnDealNames(graph)).toEqual(['洋上風力プロジェクト'])
        expect(graph.unmatchedDeals).toEqual([])

        const involved = graph.edges.filter((e) => e.data.kind === 'involved')
        expect(involved).toHaveLength(1)
        expect(involved[0].data.source).toBe('contact:c1')
    })

    it('carries the job title through as the node subtitle', () => {
        const {graph} = buildAccount({focusId: 'c1', customers, deals})
        const focus = graph.nodes.find((n) => n.data.recordId === 'c1')

        expect(focus.data.subtitle).toBe('調達部長')
        expect(focus.data.interactionCount).toBe(7)
        expect(focus.data.band).toBe('frequent')
    })
})

describe('a company name full of characters that mean something to a regex', () => {
    // If any layer built a pattern out of the company name instead of comparing
    // values, these would either throw or match far too much.
    const NAME = 'A+ Energy (Pty) Ltd. [NSW] *2024*'
    const customers = [
        person('c1', 'Dana Whitfield', NAME),
        person('c2', 'Priya Raman', NAME, {owner: 'u2'}),
        // Both of these are matched by a pattern built out of the name above
        // without escaping it, and neither is that company, so a graph that
        // draws them is matching by pattern instead of by value.
        person('c3', 'Regex Imposter One', 'A Energy Pty LtdX N 2024'),
        person('c4', 'Regex Imposter Two', 'A Energy Pty Ltd! S 202'),
    ]

    it('matches the company literally', () => {
        const {graph} = buildAccount({focusId: 'c1', customers})

        expect(labelsOf(graph, 'contact')).toEqual(['Dana Whitfield', 'Priya Raman'])
        expect(graph.account.company).toBe(NAME)
    })

    it('keeps a deal whose customer name also contains metacharacters', () => {
        const customersWithOddName = [
            person('c1', 'D. (Dana) Whitfield *', NAME),
            ...customers.slice(1),
        ]
        const deals = [deal('d1', 'Rooftop package', NAME, 'D. (Dana) Whitfield *')]
        const {graph} = buildAccount({focusId: 'c1', customers: customersWithOddName, deals})

        expect(drawnDealNames(graph)).toEqual(['Rooftop package'])
        expect(graph.unmatchedDeals).toEqual([])
    })
})

describe('punctuation and accents in names', () => {
    const NAME = "O'Brien & Sons"
    const customers = [
        person('c1', "Seán O'Brien", NAME, {interactions: touches(3)}),
        person('c2', 'Zoë Müller', NAME, {owner: 'u2'}),
        person('c3', 'José Álvarez', NAME, {owner: 'u3'}),
    ]

    it('groups an account whose name carries an apostrophe and an ampersand', () => {
        const {graph} = buildAccount({focusId: 'c1', customers})
        expect(labelsOf(graph, 'contact')).toHaveLength(3)
        expect(labelsOf(graph, 'company')).toEqual([NAME])
    })

    it('matches a deal to an accented name typed in a different case', () => {
        const deals = [deal('d1', 'Solar retrofit', NAME, 'josé álvarez')]
        const {graph} = buildAccount({focusId: 'c1', customers, deals})

        expect(drawnDealNames(graph)).toEqual(['Solar retrofit'])
        const involved = graph.edges.filter((e) => e.data.kind === 'involved')
        expect(involved.map((e) => e.data.source)).toEqual(['contact:c3'])
    })
})

// These are the same expectations as relationshipGraph.grouping.test.js, which
// runs them over the endpoint against a real server. Here they are checked at
// the pipeline level under JavaScript's own case folding. The pair is what
// separates a mistake in the rule from a difference in who applies it: if these
// pass and the server-backed ones do not, the rule is right and the server
// folded the string differently.
describe('case folding outside ASCII', () => {
    const groupedBy = (customers, focusId) =>
        labelsOf(buildAccount({focusId, customers}).graph, 'contact')

    it('groups an accented company name spelled in different cases', () => {
        expect(
            groupedBy(
                [
                    person('c1', 'Lars Fischer', 'Müller Fertigung GmbH'),
                    person('c2', 'Ines Weber', 'MÜLLER FERTIGUNG GMBH', {owner: 'u2'}),
                ],
                'c1'
            )
        ).toEqual(['Ines Weber', 'Lars Fischer'])
    })

    it('groups a company name that has no case', () => {
        expect(
            groupedBy(
                [
                    person('c1', '川口 花子', '川口リニューアブルズ株式会社'),
                    person('c2', '佐藤 健', '  川口リニューアブルズ株式会社  ', {owner: 'u2'}),
                ],
                'c1'
            )
        ).toEqual(['佐藤 健', '川口 花子'].sort())
    })

    // Case folding without a locale cannot reconcile these spellings, so they
    // are different names, the same as a company written two ways.
    it('keeps dotted and dotless i apart', () => {
        expect(
            groupedBy(
                [
                    person('c1', 'Deniz Yilmaz', 'Işık Enerji'),
                    person('c2', 'Ece Kaya', 'IŞIK ENERJİ', {owner: 'u2'}),
                ],
                'c1'
            )
        ).toEqual(['Deniz Yilmaz'])
    })

    it('keeps a sharp s apart from its two-letter spelling', () => {
        expect(
            groupedBy(
                [
                    person('c1', 'Ulf Brandt', 'Straße Werke'),
                    person('c2', 'Eva Roth', 'Strasse Werke', {owner: 'u2'}),
                ],
                'c1'
            )
        ).toEqual(['Ulf Brandt'])
    })
})

describe('company names that look similar but are not the same account', () => {
    const customers = [
        person('c1', 'Alan Reyes', 'Northwind Traders'),
        person('c2', 'Bea Nkosi', '  NORTHWIND TRADERS  ', {owner: 'u2'}),
        person('c3', 'Cal Devi', 'Northwind Traders Pty', {owner: 'u3'}),
        person('c4', 'Dee Okafor', 'Northwind  Traders', {owner: 'u2'}),
    ]

    it('merges names differing only by case or surrounding space', () => {
        const {graph} = buildAccount({focusId: 'c1', customers})
        expect(labelsOf(graph, 'contact')).toEqual(['Alan Reyes', 'Bea Nkosi'])
    })

    it('keeps a longer name and a double-spaced name as separate accounts', () => {
        const {graph} = buildAccount({focusId: 'c1', customers})
        const drawn = labelsOf(graph, 'contact')

        expect(drawn).not.toContain('Cal Devi')
        expect(drawn).not.toContain('Dee Okafor')
    })

    it('draws each of those as its own account when opened from there', () => {
        const fromPty = buildAccount({focusId: 'c3', customers}).graph
        expect(labelsOf(fromPty, 'contact')).toEqual(['Cal Devi'])
        expect(fromPty.account.company).toBe('Northwind Traders Pty')

        const fromDoubleSpace = buildAccount({focusId: 'c4', customers}).graph
        expect(labelsOf(fromDoubleSpace, 'contact')).toEqual(['Dee Okafor'])
    })
})

describe('deals across the whole pipeline', () => {
    const NAME = 'Harbour Logistics'
    const STAGES = [
        'Qualified',
        'Contact Made',
        'Demo Scheduled',
        'Proposal Made',
        'Negotiation',
        'Won',
        'Lost',
    ]
    const customers = [person('c1', 'Mina Haddad', NAME, {interactions: touches(2)})]
    const deals = STAGES.map((stage, i) =>
        deal(`d${i}`, `${stage} deal`, NAME, 'Mina Haddad', {stage})
    )

    it('draws a deal at every stage the model allows', () => {
        const {graph} = buildAccount({focusId: 'c1', customers, deals})
        expect(drawnDealNames(graph)).toHaveLength(STAGES.length)

        const stages = graph.nodes
            .filter((n) => n.data.kind === 'deal')
            .map((n) => n.data.stage)
        expect(new Set(stages)).toEqual(new Set(STAGES))
    })

    it('ranks open deals ahead of closed ones under a tight cap', () => {
        const capped = buildGraph({
            focusContact: {_id: 'c1', fullName: 'Mina Haddad', company: NAME, interactionCount: 2},
            contacts: [],
            deals,
            maxNodes: 4, // company + focus + 2 deals
        })

        const keptStages = capped.nodes
            .filter((n) => n.data.kind === 'deal')
            .map((n) => n.data.stage)
        expect(keptStages).toHaveLength(2)
        expect(keptStages).not.toContain('Won')
        expect(keptStages).not.toContain('Lost')
    })

    it('lists a deal whose customer matches nobody instead of dropping it', () => {
        const withStray = [
            ...deals,
            deal('dx', 'Mystery order', NAME, 'Someone Not Here', {stage: 'Proposal Made'}),
        ]
        const {graph} = buildAccount({focusId: 'c1', customers, deals: withStray})

        expect(drawnDealNames(graph)).not.toContain('Mystery order')
        expect(graph.unmatchedDeals.map((d) => d.name)).toEqual(['Mystery order'])
        expect(graph.unmatchedDeals[0].customerName).toBe('Someone Not Here')
    })

    it('handles a deal with no stage and no customer recorded', () => {
        const ragged = [deal('d9', 'Untitled opportunity', NAME, '', {stage: undefined})]
        const {graph} = buildAccount({focusId: 'c1', customers, deals: ragged})

        // Reached the account through its company, but names no contact.
        expect(graph.unmatchedDeals.map((d) => d.name)).toEqual(['Untitled opportunity'])
        expect(graph.unmatchedDeals[0].stage).toBeNull()
        expect(() => JSON.stringify(graph)).not.toThrow()
    })
})

describe('contact details that are missing or awkward', () => {
    const NAME = 'Cascade Health'

    it('falls back to the department when no job title is recorded', () => {
        const customers = [
            person('c1', 'Ingrid Sol', NAME, {designation: '', department: 'Procurement'}),
        ]
        const {graph} = buildAccount({focusId: 'c1', customers})
        expect(graph.nodes.find((n) => n.data.recordId === 'c1').data.subtitle).toBe('Procurement')
    })

    it('leaves the subtitle empty when neither is recorded', () => {
        const customers = [person('c1', 'Ingrid Sol', NAME, {designation: '', department: ''})]
        const {graph} = buildAccount({focusId: 'c1', customers})
        expect(graph.nodes.find((n) => n.data.recordId === 'c1').data.subtitle).toBe('')
    })

    it('draws two colleagues who share a name and attaches a deal to both', () => {
        const customers = [
            person('c1', 'Chris Taylor', NAME, {designation: 'Head of IT'}),
            person('c2', 'Chris Taylor', NAME, {designation: 'Ward Manager', owner: 'u2'}),
        ]
        const deals = [deal('d1', 'Bed management rollout', NAME, 'chris taylor')]
        const {graph} = buildAccount({focusId: 'c1', customers, deals})

        const involved = graph.edges.filter((e) => e.data.kind === 'involved')
        expect(involved.map((e) => e.data.source).sort()).toEqual(['contact:c1', 'contact:c2'])
        expect(graph.nodes.find((n) => n.data.recordId === 'd1').data.contactCount).toBe(2)
    })

    it('carries a very long name through without truncating or failing', () => {
        const longName = 'Aleksandra Konstantinopolitanska-Wojciechowska'.repeat(3)
        const customers = [person('c1', longName, NAME)]
        const {graph} = buildAccount({focusId: 'c1', customers})

        expect(graph.nodes.find((n) => n.data.recordId === 'c1').data.label).toBe(longName)
    })

    it('still builds an account when a colleague has no owner or team', () => {
        const customers = [
            person('c1', 'Ada Chen', NAME),
            person('c2', 'Legacy Record', NAME, {owner: null, team: null}),
        ]
        const {graph} = buildAccount({focusId: 'c1', customers})
        expect(labelsOf(graph, 'contact')).toEqual(['Ada Chen', 'Legacy Record'])
    })
})

describe('salespeople across a mixed account', () => {
    const NAME = 'Pinewood Freight'
    const customers = [
        person('c1', 'Tom Ide', NAME, {owner: 'u1', interactions: touches(6)}),
        person('c2', 'Lena Farah', NAME, {owner: 'u2'}),
        person('c3', 'Owner Unknown', NAME, {owner: 'u9'}), // no matching user row
    ]
    const deals = [deal('d1', 'Cold chain upgrade', NAME, 'Tom Ide', {createdBy: 'u3'})]
    const users = [
        {_id: 'u1', fullName: 'Rae Simmons'},
        {_id: 'u2', fullName: 'Kofi Mensah'},
        {_id: 'u3', fullName: 'Dan Ortiz'},
    ]

    it('draws each salesperson the surviving records point at', () => {
        const {graph} = buildAccount({focusId: 'c1', customers, deals, users})
        expect(labelsOf(graph, 'salesperson')).toEqual(['Dan Ortiz', 'Kofi Mensah', 'Rae Simmons'])
    })

    it('draws no edge for an owner with no matching user record', () => {
        const {graph} = buildAccount({focusId: 'c1', customers, deals, users})
        const owns = graph.edges.filter((e) => e.data.kind === 'owns')

        expect(owns.every((e) => e.data.target !== 'contact:c3')).toBe(true)
        expect(graph.nodes.some((n) => n.data.recordId === 'u9')).toBe(false)
    })

    it('emits no edge whose endpoints are not both drawn', () => {
        const {graph} = buildAccount({focusId: 'c1', customers, deals, users})
        const drawn = new Set(graph.nodes.map((n) => n.data.id))

        for (const edge of graph.edges) {
            expect(drawn.has(edge.data.source)).toBe(true)
            expect(drawn.has(edge.data.target)).toBe(true)
        }
    })
})

describe('interaction windows on a fresh tenant', () => {
    const NAME = 'Beacon Analytics'

    it('counts only what falls inside the window but still dates the last touch', () => {
        const customers = [
            person('c1', 'Nadia Fox', NAME, {
                interactions: [
                    {type: 'Call', details: 'recent', date: daysBefore(5)},
                    {type: 'Email', details: 'recent', date: daysBefore(80)},
                    {type: 'Call', details: 'old', date: daysBefore(200)},
                ],
            }),
        ]
        const {graph} = buildAccount({focusId: 'c1', customers})
        const node = graph.nodes.find((n) => n.data.recordId === 'c1')

        expect(node.data.interactionCount).toBe(2)
        expect(node.data.band).toBe('some')
        expect(node.data.lastInteractionAt).toBe(daysBefore(5).toISOString())
    })

    it('reports a quiet account rather than showing nothing', () => {
        const customers = [
            person('c1', 'Nadia Fox', NAME, {
                interactions: [{type: 'Call', details: 'old', date: daysBefore(400)}],
            }),
            person('c2', 'Omar Said', NAME, {owner: 'u2'}),
        ]
        const {graph} = buildAccount({focusId: 'c1', customers})

        expect(graph.notices.map((n) => n.code)).toContain('no-recent-interactions')
        expect(graph.edges.filter((e) => e.data.kind === 'employs').every((e) => e.data.band === 'none')).toBe(true)
    })

    it('says so when a contact has no company, whatever the tenant', () => {
        const customers = [person('c1', 'Solo Contact', '')]
        const {graph} = buildAccount({focusId: 'c1', customers})

        expect(graph.notices.map((n) => n.code)).toEqual(['no-company'])
        expect(graph.account.hasCompany).toBe(false)
        expect(labelsOf(graph, 'company')).toEqual([])
        expect(labelsOf(graph, 'contact')).toEqual(['Solo Contact'])
    })
})
