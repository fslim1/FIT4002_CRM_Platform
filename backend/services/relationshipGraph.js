// Relationship Graph: pure derivation.
//
// This module turns already-scoped records into the node/edge set the panel
// draws. It deliberately imports neither Express nor Mongoose: every input is a
// plain object, so the whole of the graph's shape can be tested without a
// database or an HTTP server.
//
// Access control is NOT this module's job. The controller is responsible for
// passing in only records the viewer may see. What this module guarantees
// is that it never invents a record and never emits an edge whose endpoints are
// not both present in `nodes`, so an out-of-scope record can never be implied
// by a dangling connection.

// --- Constants -------------------------------------------------------------

// The interaction window, in days. Exported so the controller builds its cutoff
// from the same number the legend describes.
const WINDOW_DAYS = 90

// Upper bound on drawn nodes. Applied here rather than in the browser so the
// response payload is bounded too.
const MAX_NODES = 150

// Connection-strength bands. Returned in the API response so the legend is
// rendered from these values and cannot drift from the thresholds used here.
// `max: null` means unbounded.
const BANDS = [
    {key: 'none', min: 0, max: 0, label: 'No contact in the last 90 days'},
    {key: 'some', min: 1, max: 4, label: 'Some contact'},
    {key: 'frequent', min: 5, max: null, label: 'Frequent contact'},
]

// Mirrors the `stage` enum on backend/models/Deal.js. Duplicated rather than
// imported to keep this module free of Mongoose; a test asserts the two agree.
const STAGE_ORDER = [
    'Qualified',
    'Contact Made',
    'Demo Scheduled',
    'Proposal Made',
    'Negotiation',
    'Won',
    'Lost',
]

const CLOSED_STAGES = new Set(['Won', 'Lost'])

const NODE_KINDS = {COMPANY: 'company', CONTACT: 'contact', DEAL: 'deal', SALESPERSON: 'salesperson'}
const EDGE_KINDS = {EMPLOYS: 'employs', INVOLVED: 'involved', OWNS: 'owns', CREATED: 'created'}

// --- Normalisation ---------------------------------------------------------

// Company matching is exact and case-insensitive, ignoring surrounding
// whitespace, and deal-to-contact name matching follows the same rule. Note
// what this deliberately does NOT do: it does not collapse whitespace inside
// the value, so a name carrying a double space is a different account from the
// same name with one. That is expected behaviour rather than a fault.
//
// The controller must not re-implement this rule in its queries. It matches
// with MongoDB's own $toLower/$trim on both sides of the comparison, so one
// rule decides membership rather than two that can drift apart. Note that
// $toLower is defined for ASCII, so a name outside it may not fold case at
// all; docs/relationship-graph.md records what that costs.
const normaliseKey = (value) => String(value ?? '').trim().toLowerCase()

const accountKey = normaliseKey

// One definition of "how many interactions", used by bandFor and by every
// place that puts a count on a node or an edge, so a node's count and its band
// can never describe different numbers.
const safeCount = (value) => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

const bandFor = (count) => {
    const n = safeCount(count)
    const band = BANDS.find((b) => n >= b.min && (b.max === null || n <= b.max))
    return (band || BANDS[0]).key
}

// The start of the interaction window. The controller builds its aggregation
// cutoff from this so the window lives in exactly one place.
const cutoffFrom = (now = new Date()) =>
    new Date(new Date(now).getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000)

const idOf = (value) => {
    if (value === null || value === undefined) return null
    // Accepts an ObjectId, a populated document, or a plain string.
    if (typeof value === 'object') return String(value._id ?? value)
    return String(value)
}

const isoOrNull = (value) => {
    if (value === null || value === undefined) return null
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

// Codepoint order rather than localeCompare: this is a tie-break that decides
// which records survive the node cap, so it must give the same answer on every
// machine regardless of the runtime's locale.
const byString = (a, b) => {
    const x = String(a ?? '')
    const y = String(b ?? '')
    return x < y ? -1 : x > y ? 1 : 0
}

// Milliseconds since the epoch, or 0 for anything unusable. Returning a number
// always keeps sort comparators from going NaN, which would make the ordering
// implementation-defined.
const timeValue = (value) => {
    if (value === null || value === undefined) return 0
    const date = value instanceof Date ? value : new Date(value)
    const ms = date.getTime()
    return Number.isNaN(ms) ? 0 : ms
}

// --- Derivation ------------------------------------------------------------

/**
 * Build the graph for one account.
 *
 * Every record passed in must already be inside the viewer's scope.
 *
 * @param {object}   input
 * @param {object}   input.focusContact  the contact whose profile was opened
 * @param {object[]} input.contacts      contacts in the account (focus included)
 * @param {object[]} input.deals         deals in the account
 * @param {object[]} input.users         salespeople referenced by those records
 * @param {object[]} [input.dealContactLinks] extra deal-to-contact links, as
 *   `{deal, contact}` id pairs. A deal names at most one customer, so that
 *   field alone can only ever connect a deal to a single person. Any other
 *   record that ties a deal to a contact, such as a task raised against both,
 *   can be passed here and is treated as equal evidence. Links naming a contact
 *   outside the account are ignored, and the caller is responsible for passing
 *   only records the viewer may see.
 * @param {number}  [input.maxNodes]     node cap; defaults to MAX_NODES
 * @returns {{account, meta, nodes, edges, unmatchedDeals, notices}}
 */
const buildGraph = ({
                        focusContact,
                        contacts = [],
                        deals = [],
                        users = [],
                        dealContactLinks = [],
                        maxNodes = MAX_NODES,
                    } = {}) => {
    if (!focusContact) throw new Error('buildGraph requires a focusContact')

    const focusId = idOf(focusContact._id)
    if (!focusId) throw new Error('buildGraph requires a focusContact with an _id')

    const companyKey = accountKey(focusContact.company)
    const hasCompany = companyKey !== ''

    const account = {
        company: typeof focusContact.company === 'string' ? focusContact.company.trim() : '',
        companyKey,
        focusCustomerId: focusId,
        hasCompany,
    }

    // A contact with no company recorded cannot be grouped into an
    // account, so it draws alone with an explanation rather than inventing a
    // company node or guessing at colleagues.
    if (!hasCompany) {
        return {
            account,
            meta: emptyMeta({maxNodes, counts: {contacts: 1, deals: 0, salespeople: 0}}),
            nodes: [contactNode(focusContact, {isFocus: true})],
            edges: [],
            unmatchedDeals: [],
            notices: [{code: 'no-company'}],
        }
    }

    // --- Contacts ---
    // The focus contact must always be present, even if the caller's list
    // omitted it: getVisibleCustomerFilter and canViewCustomer disagree for a
    // customer with no owner but a team, so a viewer can be authorised to open
    // a profile that the scope filter does not return. Without this the graph
    // would silently omit the person it was opened from.
    const contactsById = new Map()
    for (const contact of [focusContact, ...contacts]) {
        const id = idOf(contact._id)
        if (id && !contactsById.has(id)) contactsById.set(id, contact)
    }
    const allContacts = [...contactsById.values()]

    // --- Deal to contact matching ---
    // A deal is matched by the customer name recorded on it. Two visible
    // contacts sharing a name both match: the graph shows the ambiguity rather
    // than silently picking one.
    const contactIdsByNameKey = new Map()
    for (const [id, contact] of contactsById) {
        const key = normaliseKey(contact.fullName)
        if (key === '') continue
        if (!contactIdsByNameKey.has(key)) contactIdsByNameKey.set(key, [])
        contactIdsByNameKey.get(key).push(id)
    }

    // Links supplied by the caller, keyed by deal. Anything pointing at a
    // contact outside this account is dropped rather than pulling that record in.
    const linkedContactsByDealId = new Map()
    for (const link of dealContactLinks) {
        const dealId = idOf(link?.deal ?? link?.dealId)
        const contactId = idOf(link?.contact ?? link?.contactId)
        if (!dealId || !contactId || !contactsById.has(contactId)) continue
        if (!linkedContactsByDealId.has(dealId)) linkedContactsByDealId.set(dealId, new Set())
        linkedContactsByDealId.get(dealId).add(contactId)
    }

    const matchedDeals = []
    const unmatchedDeals = []
    const contactIdsByDealId = new Map()
    // How each deal reached each contact, so the panel can explain a connection.
    const evidenceByPair = new Map()
    const pairKey = (dealId, contactId) => `${dealId}|${contactId}`

    // Deduplicated by id: the same deal reaching here twice would otherwise
    // produce two nodes sharing one id, which Cytoscape rejects.
    const dealsById = new Map()
    for (const d of deals) {
        const id = idOf(d._id)
        if (id && !dealsById.has(id)) dealsById.set(id, d)
    }

    for (const deal of dealsById.values()) {
        const dealId = idOf(deal._id)
        const named = contactIdsByNameKey.get(normaliseKey(deal.customer)) || []
        const linked = [...(linkedContactsByDealId.get(dealId) || [])]

        for (const contactId of named) evidenceByPair.set(pairKey(dealId, contactId), 'deal-customer')
        for (const contactId of linked) {
            const key = pairKey(dealId, contactId)
            if (!evidenceByPair.has(key)) evidenceByPair.set(key, 'linked-record')
        }

        const matches = [...named, ...linked]

        if (matches.length === 0) {
            // Never silently dropped. Listed beside the graph instead.
            unmatchedDeals.push({
                id: dealId,
                name: deal.name ?? '',
                stage: deal.stage ?? null,
                company: deal.company ?? '',
                customerName: deal.customer ?? '',
                reason: 'no-contact-match',
            })
            continue
        }

        contactIdsByDealId.set(dealId, [...new Set(matches)])
        matchedDeals.push(deal)
    }

    // --- Node budget ---
    // Ordering: the company node and the focus contact are always kept, then
    // contacts by how active they are, then deals attached to a surviving
    // contact, then the salespeople those survivors reference. Contacts are
    // ranked ahead of deals because a deal with no contact left on the graph
    // carries no relationship information.
    let budget = maxNodes
    const keptContactIds = new Set()

    if (hasCompany) budget -= 1 // the company node
    keptContactIds.add(focusId)
    budget -= 1
    // The company node and the focus contact are kept even when that exceeds a
    // very small cap: a graph without them would not be a graph of this account.

    const rankedContacts = allContacts
        .filter((c) => idOf(c._id) !== focusId)
        .sort(
            (a, b) =>
                safeCount(b.interactionCount) - safeCount(a.interactionCount) ||
                timeValue(b.lastInteractionAt) - timeValue(a.lastInteractionAt) ||
                byString(a.fullName, b.fullName)
        )

    for (const contact of rankedContacts) {
        if (budget <= 0) break
        keptContactIds.add(idOf(contact._id))
        budget -= 1
    }

    const rankedDeals = matchedDeals
        .filter((d) => contactIdsByDealId.get(idOf(d._id)).some((id) => keptContactIds.has(id)))
        .sort((a, b) => {
            const aClosed = CLOSED_STAGES.has(a.stage) ? 1 : 0
            const bClosed = CLOSED_STAGES.has(b.stage) ? 1 : 0
            if (aClosed !== bClosed) return aClosed - bClosed
            // Later pipeline stages first: those deals are closest to closing.
            const stageDelta = STAGE_ORDER.indexOf(b.stage) - STAGE_ORDER.indexOf(a.stage)
            return stageDelta || byString(a.name, b.name)
        })

    const keptDeals = []
    for (const deal of rankedDeals) {
        if (budget <= 0) break
        keptDeals.push(deal)
        budget -= 1
    }
    const keptDealIds = new Set(keptDeals.map((d) => idOf(d._id)))

    // --- Salespeople ---
    const usersById = new Map()
    for (const user of users) {
        const id = idOf(user._id)
        if (id) usersById.set(id, user)
    }

    // Collected in a stable order so the cap cuts the same people every time.
    const ownsPairs = [] // [userId, contactId]
    for (const contactId of keptContactIds) {
        const ownerId = idOf(contactsById.get(contactId)?.owner)
        // A record with no owner, or an owner that could not be resolved, simply
        // produces no edge. Never an error, and never a placeholder node.
        if (ownerId && usersById.has(ownerId)) ownsPairs.push([ownerId, contactId])
    }

    const createdPairs = [] // [userId, dealId]
    for (const deal of keptDeals) {
        const creatorId = idOf(deal.createdBy)
        if (creatorId && usersById.has(creatorId)) createdPairs.push([creatorId, idOf(deal._id)])
    }

    // Every salesperson the surviving records point at. Compared against the
    // set actually drawn so a salesperson lost to the cap is reported rather
    // than leaving a contact or deal silently unattributed.
    const referencedUserIds = new Set([...ownsPairs, ...createdPairs].map(([userId]) => userId))

    const keptUserIds = new Set()
    for (const userId of referencedUserIds) {
        if (budget <= 0) break
        keptUserIds.add(userId)
        budget -= 1
    }

    // --- Emit ---
    const nodes = []
    const edges = []

    if (hasCompany) nodes.push(companyNode(account))

    for (const contactId of keptContactIds) {
        const contact = contactsById.get(contactId)
        nodes.push(contactNode(contact, {isFocus: contactId === focusId}))

        const count = safeCount(contact.interactionCount)
        edges.push({
            data: {
                id: `e:${EDGE_KINDS.EMPLOYS}:${contactId}`,
                source: companyNodeId(companyKey),
                target: contactNodeId(contactId),
                kind: EDGE_KINDS.EMPLOYS,
                band: bandFor(count),
                interactionCount: count,
                lastInteractionAt: isoOrNull(contact.lastInteractionAt),
            },
        })
    }

    for (const deal of keptDeals) {
        const dealId = idOf(deal._id)
        const linked = contactIdsByDealId.get(dealId).filter((id) => keptContactIds.has(id))

        nodes.push({
            data: {
                id: dealNodeId(dealId),
                kind: NODE_KINDS.DEAL,
                label: deal.name ?? '',
                recordId: dealId,
                stage: deal.stage ?? null,
                company: deal.company ?? '',
                // How many of this account's visible contacts the deal is drawn
                // against. A single-threaded warning can be built on this.
                contactCount: linked.length,
            },
        })

        for (const contactId of linked) {
            edges.push({
                data: {
                    id: `e:${EDGE_KINDS.INVOLVED}:${contactId}:${dealId}`,
                    source: contactNodeId(contactId),
                    target: dealNodeId(dealId),
                    kind: EDGE_KINDS.INVOLVED,
                    evidence: evidenceByPair.get(pairKey(dealId, contactId)) || 'deal-customer',
                },
            })
        }
    }

    for (const userId of keptUserIds) {
        nodes.push({
            data: {
                id: userNodeId(userId),
                kind: NODE_KINDS.SALESPERSON,
                label: usersById.get(userId).fullName ?? '',
                recordId: userId,
            },
        })
    }

    for (const [userId, contactId] of ownsPairs) {
        if (!keptUserIds.has(userId)) continue
        edges.push({
            data: {
                id: `e:${EDGE_KINDS.OWNS}:${userId}:${contactId}`,
                source: userNodeId(userId),
                target: contactNodeId(contactId),
                kind: EDGE_KINDS.OWNS,
            },
        })
    }

    for (const [userId, dealId] of createdPairs) {
        if (!keptUserIds.has(userId) || !keptDealIds.has(dealId)) continue
        edges.push({
            data: {
                id: `e:${EDGE_KINDS.CREATED}:${userId}:${dealId}`,
                source: userNodeId(userId),
                target: dealNodeId(dealId),
                kind: EDGE_KINDS.CREATED,
            },
        })
    }

    assertNoDanglingEdges(nodes, edges)

    // --- Meta and notices ---
    const omitted = {
        contacts: allContacts.length - keptContactIds.size,
        deals: matchedDeals.length - keptDeals.length,
        salespeople: referencedUserIds.size - keptUserIds.size,
    }
    const capped = omitted.contacts > 0 || omitted.deals > 0 || omitted.salespeople > 0

    const notices = []
    // One contact and nothing else recorded against the account yet.
    if (allContacts.length === 1 && dealsById.size === 0) notices.push({code: 'sparse-account'})
    // Every relationship has gone quiet, so every connection is drawn in the
    // lowest band.
    if (allContacts.every((c) => bandFor(c.interactionCount) === 'none')) {
        notices.push({code: 'no-recent-interactions'})
    }
    if (capped) notices.push({code: 'capped'})

    return {
        account,
        meta: {
            windowDays: WINDOW_DAYS,
            bands: BANDS,
            limits: {maxNodes},
            capped,
            omitted,
            counts: {
                contacts: keptContactIds.size,
                deals: keptDeals.length,
                salespeople: keptUserIds.size,
                unmatchedDeals: unmatchedDeals.length,
            },
        },
        nodes,
        edges,
        unmatchedDeals,
        notices,
    }
}

// --- Node builders ---------------------------------------------------------

const companyNodeId = (companyKey) => `${NODE_KINDS.COMPANY}:${companyKey}`
const contactNodeId = (id) => `${NODE_KINDS.CONTACT}:${id}`
const dealNodeId = (id) => `${NODE_KINDS.DEAL}:${id}`
const userNodeId = (id) => `user:${id}`

const companyNode = (account) => ({
    data: {
        id: companyNodeId(account.companyKey),
        kind: NODE_KINDS.COMPANY,
        label: account.company,
    },
})

const contactNode = (contact, {isFocus}) => {
    const count = safeCount(contact.interactionCount)
    return {
        data: {
            id: contactNodeId(idOf(contact._id)),
            kind: NODE_KINDS.CONTACT,
            label: contact.fullName ?? '',
            recordId: idOf(contact._id),
            subtitle: contact.designation || contact.department || '',
            isFocus,
            interactionCount: count,
            lastInteractionAt: isoOrNull(contact.lastInteractionAt),
            band: bandFor(count),
        },
    }
}

const emptyMeta = ({maxNodes, counts}) => ({
    windowDays: WINDOW_DAYS,
    bands: BANDS,
    limits: {maxNodes},
    capped: false,
    omitted: {contacts: 0, deals: 0, salespeople: 0},
    counts: {unmatchedDeals: 0, ...counts},
})

// Guarantees that a record outside the viewer's scope can never be implied by
// a dangling connection, structurally rather than by review. Throwing is deliberate: an edge pointing at a node that is
// not in the payload would let a viewer infer a record outside their scope, so
// it must fail loudly rather than reach the browser.
const assertNoDanglingEdges = (nodes, edges) => {
    const ids = new Set(nodes.map((n) => n.data.id))
    for (const edge of edges) {
        if (!ids.has(edge.data.source) || !ids.has(edge.data.target)) {
            throw new Error(
                `relationshipGraph: edge ${edge.data.id} references a node not present in the graph`
            )
        }
    }
}

module.exports = {
    WINDOW_DAYS,
    MAX_NODES,
    BANDS,
    STAGE_ORDER,
    NODE_KINDS,
    EDGE_KINDS,
    normaliseKey,
    accountKey,
    bandFor,
    cutoffFrom,
    buildGraph,
}
