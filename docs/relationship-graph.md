# Relationship Graph

Opening a customer profile gives a panel that draws the account around that
person: the company, the contacts the viewer can see there, the deals in play,
and the salespeople who own those records. Connection thickness shows how much
contact there has been in the last 90 days.

Nothing on the graph is maintained by hand. Every node and every connection is
derived from records the team already creates, so an account produces a usable
graph the moment its first contact is entered.

This file is for people changing the feature.
[relationship-graph-user-guide.md](relationship-graph-user-guide.md) is for
people using it, and is the better place to look for what a shape, a colour or
a notice means on screen.

## How a request flows

```
CustomerProfile
  -> GET /api/relationship-graph/account/:customerId
       -> relationshipGraphController
            -> teamScope           scope filters, taken not rebuilt
            -> relationshipGraphQueries   aggregation pipelines
            -> relationshipGraph          derivation, no database
       -> { account, meta, nodes, edges, unmatchedDeals, notices }
  -> RelationshipGraphPanel -> RelationshipGraphCanvas (Cytoscape)
```

| File                                                  | Responsibility                                                                                                                                                                   |
|-------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `backend/services/relationshipGraph.js`               | Derivation. Imports nothing, so the whole shape of the graph is testable without a database.                                                                                     |
| `backend/services/relationshipGraphQueries.js`        | Aggregation pipeline builders. Also imports nothing.                                                                                                                             |
| `backend/controllers/relationshipGraphController.js`  | The only layer that talks to Mongoose. Applies scope, runs the pipelines, assembles the response.                                                                                |
| `backend/routes/relationshipGraphRoutes.js`           | One GET route. The feature reads interaction data and never writes it, so no other verb exists.                                                                                  |
| `frontend/src/components/RelationshipGraphPanel.jsx`  | Fetch lifecycle, header, side rail, notices.                                                                                                                                     |
| `frontend/src/components/RelationshipGraphCanvas.jsx` | The Cytoscape instance, hover, selection, zoom.                                                                                                                                  |
| `frontend/src/components/RelationshipGraphLegend.jsx` | The legend, rendered from `meta.bands` rather than from its own copy of the thresholds.                                                                                          |
| `frontend/src/lib/relationshipGraphStyle.js`          | The visual language, the layout, and the mapping from a response to Cytoscape elements.                                                                                          |
| `frontend/src/lib/dealStages.js`                      | Stage to colour. The same palette is still repeated in `DealDetailModal.jsx` and `SalesPipeline.jsx`; the values agree, and this module is where new code should read them from. |
| `frontend/src/api/relationshipGraph.js`               | The one request the feature makes.                                                                                                                                               |
| `frontend/src/styles/RelationshipGraph.css`           | Panel, rail and canvas styling.                                                                                                                                                  |

## What to know before changing anything

**Account grouping is decided by the database, not by JavaScript.** Both sides
of the comparison go through MongoDB's own `$toLower` and `$trim`. If a query
rebuilt that rule with a regular expression it would drift from `accountKey()`
in the service the moment either changed, and a contact would be fetched but not
grouped, or grouped but not fetched. Reuse `contactsPipeline` rather than
writing a new match.

**Access control belongs in the query.** Filters come from
`middleware/teamScope.js` and go into the aggregation itself, never into a
`.filter()` afterwards. A record outside the viewer's scope is absent from the
result set, so it cannot be named, greyed out, or implied by a connection
pointing at nothing. The derivation service enforces the last part structurally:
it will throw rather than return an edge whose endpoints are not both in
`nodes`.

The customer query widens the scope filter by exactly one document, the contact
whose profile was opened, because `canViewCustomer` and
`getVisibleCustomerFilter` disagree for a customer with no owner but a team.
Without it the graph could answer 200 and leave out the very person it was
opened from.

**Known limit on the grouping rule.** Because grouping is the database's
`$toLower`, it folds case for ASCII and is documented as well defined only for
ASCII. A company name with characters outside it, such as `Müller Fertigung
GmbH` against `MÜLLER FERTIGUNG GMBH`, can therefore form two accounts instead
of one, which is not what the panel tells the viewer. Deal-to-contact matching
is unaffected, since that happens in JavaScript over rows the query already
returned. `relationshipGraph.grouping.test.js` pins the expectation against a
real server, and `relationshipGraph.data.test.js` pins the same cases at the
pipeline level, so the pair says whether the rule or the server is at fault.
Fixing it means changing how the query compares, not adding a second
normalisation in JavaScript: two rules is the failure the current design exists
to prevent.

## The response

```jsonc
{
  "account": { "company", "companyKey", "focusCustomerId", "hasCompany" },
  "meta": {
    "generatedAt", "buildMs", "windowDays",
    "bands":  [ { "key", "min", "max", "label" } ],
    "scope":  { "role", "viewAllData", "label" },
    "capped", "limits", "omitted", "counts"
  },
  "nodes": [ { "data": { "id", "kind", "label", "recordId", ... } } ],
  "edges": [ { "data": { "id", "source", "target", "kind", ... } } ],
  "unmatchedDeals": [ { "id", "name", "stage", "company", "customerName", "reason" } ],
  "notices": [ { "code" } ]
}
```

Node kinds are `company`, `contact`, `deal` and `salesperson`. Edge kinds are
`employs` (company to contact, carrying the interaction band), `involved`
(contact to deal), `owns` and `created`.

On an account past `DENSE_NODE_COUNT` nodes the canvas holds names back until
the viewer zooms in, hovers or selects, because at that size every label lands
on its neighbours. The company keeps its name throughout, and the layout still
reserves room for label text, which is what makes zooming in readable rather
than merely larger.

The band thresholds and their wording travel in `meta.bands`, and the legend is
rendered from them. Changing a threshold in the service changes the legend with
it, and the two can never describe different numbers.

`notices` carries a code only. The backend decides when a notice applies and the
panel owns the wording, so copy can change without a server release. Codes in
use: `no-company`, `sparse-account`, `no-recent-interactions`, `capped`.

## Extension points

**More than one contact on a deal.** A deal names at most one customer, so that
field alone can never connect a deal to more than one person. `buildGraph`
accepts `dealContactLinks`, a list of `{deal, contact}` id pairs, and treats
them as equal evidence alongside the name match. Any record that ties a deal to
a contact can be fed in this way. The controller supplies visible tasks that
reference both records. Links naming a contact outside the account are ignored,
and the caller passes only records the viewer is allowed to see.

Each drawn connection carries an `evidence` value saying how it was reached,
either `deal-customer` or `linked-record`, so the panel can explain a connection
rather than just asserting it.

**A new notice.** Add the condition in the service and the wording in
`noticeText` in the panel. Nothing else needs to change.

**A new node or edge style.** `relationshipGraphStyle.js` holds the whole visual
language. Every node kind differs in both shape and colour, because resting the
distinction on colour alone fails for a colour-blind viewer and in a greyscale
print. Keep that property for anything new.

**Single-contact deals.** A deal node is `singleThreaded` when its distinct
contact set contains exactly one contact. The set combines the deal's Customer
name with visible tasks that reference both the deal and a contact, and is
deduplicated before the node cap is applied. The canvas, legend and side list
all use that same node field. It describes only records visible to the current
viewer, matching the scope used for the rest of the graph.

## Work that is not built yet

**A coverage overview across accounts.** Rank accounts by how thin their
relationship coverage is. Build it from the same scoped records and the same
derivation helpers as the panel, so the two can never disagree about an account.
`accountKey`, `bandFor` and `cutoffFrom` are exported for that purpose. Group by
account in one pass rather than calling the account endpoint per row, and note
that a case-insensitive computed match cannot use an index, so a scan guard is
worth having on a large tenant.

## Tests

```bash
cd backend && npm test
```

Most of the suite runs without a database. Suites that need one are skipped with
a printed reason rather than failing, so the run stays usable on a machine that
cannot reach the mongod download. See `backend/tests/README.md` for how a mongod
is resolved and what the in-memory aggregation suites do and do not prove.

Two suites need a reachable mongod and are worth running deliberately, since a
run without one reports them as skipped rather than failing:

- `relationshipGraph.access.test.js` is the access-control matrix over HTTP for
  Admin, Supervisor, User and a User granted view-all-data.
  `relationshipGraph.scope.test.js` covers the same rules one layer down and
  runs anywhere.
- `relationshipGraph.grouping.test.js` is the only check on the database's own
  string handling. Run it before trusting the grouping rule for a tenant whose
  name falls outside ASCII, and read the note on that limit above.
