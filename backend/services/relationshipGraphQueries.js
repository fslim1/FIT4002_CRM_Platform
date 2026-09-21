// Relationship Graph: aggregation pipeline builders.
//
// Pure functions returning plain pipeline arrays. Like the derivation service
// they import nothing, so the pipelines can be exercised against an in-memory
// aggregation engine without a database.
//
// Why aggregation rather than find():
//
//  1. Account grouping is decided by MongoDB's own $toLower/$trim on BOTH sides
//     of the comparison. A case-insensitive regex built in JavaScript would put
//     the query and the service's accountKey() out of step the moment either
//     changed, leaving a contact fetched but not grouped, or grouped but not
//     fetched. Here one rule decides membership rather than two.
//     What that rule can and cannot fold is the server's own behaviour, and
//     $toLower is defined for ASCII. docs/relationship-graph.md records the
//     limit that leaves and why the fix belongs here rather than in JavaScript.
//
//  2. Interaction counts are computed in the database. Customer.interactions is
//     an unbounded embedded array; projecting it into Node just to take its
//     length would be the single largest cost in the request.
//
// Access control lives in the `scopeFilter` argument, which callers take from
// middleware/teamScope.js. These builders never widen it, with one deliberate
// and documented exception, noted on contactsPipeline below.

// Normalises a string expression the same way the service's accountKey() does:
// trim the ends, lowercase, nothing else.
const normalised = (expr) => ({$toLower: {$trim: {input: expr}}})

// $literal keeps a value that begins with "$" from being read as a field path.
const normalisedLiteral = (value) => normalised({$literal: String(value ?? '')})

const normalisedField = (field) => normalised({$ifNull: [field, '']})

// Shared projection for contact rows. Drops `interactions` from the payload and
// replaces it with the two numbers the graph actually needs.
const contactProjection = (cutoff) => ({
    $project: {
        fullName: 1,
        nameKey: 1,
        company: 1,
        designation: 1,
        department: 1,
        owner: 1,
        interactionCount: {
            $size: {
                $filter: {
                    input: {$ifNull: ['$interactions', []]},
                    as: 'i',
                    cond: {$gte: ['$$i.date', cutoff]},
                },
            },
        },
        // Deliberately not bounded by the window: a last touch from two years
        // ago should still show a date rather than nothing.
        //
        // $map rather than the shorter {$max: '$interactions.date'}: on a
        // document written before `interactions` existed, that path resolves to
        // missing rather than an array, and $max's behaviour there is not
        // something to depend on. Mapping an $ifNull'd array always hands $max
        // an array, so an absent field yields null instead of an error.
        lastInteractionAt: {
            $max: {
                $map: {input: {$ifNull: ['$interactions', []]}, as: 'i', in: '$$i.date'},
            },
        },
    },
})

/**
 * Contacts belonging to the focus contact's account.
 *
 * The scope filter is widened by exactly one document: the focus contact.
 * canViewCustomer() and getVisibleCustomerFilter() disagree for a customer with
 * no owner but a team. The first allows it and the second does not return it,
 * so without this the graph could answer 200 and omit the very person it was
 * opened from.
 * The caller has already run canViewCustomer() on this id, so including it is
 * not a scope escape. No other document can enter through that clause.
 *
 * When the focus contact has no company recorded, the account cannot be formed
 * and the pipeline returns that contact alone. It must NOT fall back to
 * matching every other contact whose company is also blank: those are not
 * colleagues, they are unrelated records that happen to share a gap.
 */
const contactsPipeline = ({scopeFilter, focusId, companyRaw, cutoff}) => {
    const hasCompany = String(companyRaw ?? '').trim() !== ''

    const accountMatch = hasCompany
        ? {$or: [{$expr: {$eq: ['$companyKey', normalisedLiteral(companyRaw)]}}, {_id: focusId}]}
        : {_id: focusId}

    return [
        {$match: {$or: [scopeFilter, {_id: focusId}]}},
        {$addFields: {companyKey: normalisedField('$company'), nameKey: normalisedField('$fullName')}},
        {$match: accountMatch},
        contactProjection(cutoff),
    ]
}

/**
 * Deals belonging to the account.
 *
 * A deal qualifies when its own company matches the account, OR when the
 * customer name recorded on it matches a contact already resolved above. Both
 * are needed: the second draws deals against their contacts, and the first is
 * what lets a deal with no matching contact still be listed rather than
 * disappearing.
 *
 * `contactNameKeys` must be the nameKey values produced by contactsPipeline, so
 * both sides of the comparison were normalised by MongoDB itself.
 */
const dealsPipeline = ({scopeFilter, companyRaw, contactNameKeys = []}) => {
    const hasCompany = String(companyRaw ?? '').trim() !== ''

    const clauses = []
    if (hasCompany) {
        clauses.push({$expr: {$eq: ['$companyKey', normalisedLiteral(companyRaw)]}})
    }
    if (contactNameKeys.length > 0) {
        clauses.push({customerKey: {$in: contactNameKeys}})
    }

    // Nothing to match on: no company and no contact names. Return a pipeline
    // that yields nothing rather than one whose $or is empty, which MongoDB
    // rejects.
    if (clauses.length === 0) return [{$match: {_id: null}}, {$limit: 0}]

    return [
        {$match: scopeFilter},
        {
            $addFields: {
                companyKey: normalisedField('$company'),
                customerKey: normalisedField('$customer'),
            },
        },
        {$match: clauses.length === 1 ? clauses[0] : {$or: clauses}},
        {$project: {name: 1, stage: 1, company: 1, customer: 1, customerKey: 1, createdBy: 1}},
    ]
}

module.exports = {
    normalised,
    normalisedLiteral,
    normalisedField,
    contactProjection,
    contactsPipeline,
    dealsPipeline,
}
