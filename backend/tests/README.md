# Backend tests

```bash
cd backend
npm install
npm test          # jest --runInBand
npm run test:watch
```

## Suites

| File                                   | Needs a database? | What it covers                                                                                                                                                                                                     |
|----------------------------------------|-------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `app.smoke.test.js`                    | no                | `app.js` serves, keeps every route mount, enforces auth, is read-only on the graph endpoint, and does not bind a port when required                                                                                |
| `factories.test.js`                    | no                | Every factory produces a document its real Mongoose schema accepts                                                                                                                                                 |
| `relationshipGraph.derivation.test.js` | no                | The pure derivation service: grouping, matching, bands, the node cap, and the no-dangling-edge invariant (including a seeded fuzz)                                                                                 |
| `relationshipGraph.queries.test.js`    | no                | The aggregation pipelines, run through `mingo`. See the caveat below                                                                                                                                               |
| `relationshipGraph.controller.test.js` | no                | Controller flow and status codes, with model stubs whose `aggregate()` runs the real pipelines through `mingo`                                                                                                     |
| `relationshipGraph.scope.test.js`      | no                | The real `teamScope` filters per role, applied to in-memory records, the same matrix one layer below HTTP                                                                                                          |
| `relationshipGraph.data.test.js`       | no                | The whole read path over tenants other than the one the feature was built against: company names with punctuation and pattern characters, names outside ASCII, every pipeline stage, and ragged or missing details |
| `db-harness.test.js`                   | yes               | Round trip through `connect` / `clear` / `disconnect`, and that the scope-filter indexes reach MongoDB                                                                                                             |
| `relationshipGraph.access.test.js`     | yes               | The access-control matrix over HTTP: Admin, Supervisor, User, and a User granted view-all-data                                                                                                                     |
| `relationshipGraph.grouping.test.js`   | yes               | The grouping rule the panel describes, over the endpoint, for company names inside and outside ASCII. The only place the server's own string handling is actually exercised                                        |

### Case folding outside ASCII

`relationshipGraph.data.test.js` and `relationshipGraph.grouping.test.js` assert
the same grouping expectations, the first at the pipeline level under
JavaScript's case folding and the second over the endpoint against a real
server. Running both is what separates a mistake in the rule from a difference
in who applies it.

If the pipeline-level cases pass and the server-backed ones fail on a company
name outside ASCII, the rule is right and the server folded the string
differently: `$toLower` is documented as well defined for ASCII only, and leaves
some other characters as they are. Grouping is decided entirely by that
operator, so two spellings of such a name that differ only in case form two
accounts rather than one, which is not what the panel tells the viewer.

### What the mingo suites do and do not prove

`mingo` is a pure-JavaScript implementation of MongoDB's query and aggregation
language. It lets the pipelines be exercised on any machine, and it catches a
malformed pipeline or wrong matching logic immediately.

It is **not** MongoDB. `$toLower` is ASCII-defined on the real server, collation
and BSON comparison order are the server's own, and mingo is a separate
implementation that has already been seen to differ (it throws on
`{$max: '$missingField.path'}` where MongoDB does not).

So a green mingo run means the logic is right; it does not mean the server
agrees. `relationshipGraph.access.test.js` is what confirms real-server
behaviour, and it needs a mongod.

## How a mongod is resolved

`tests/globalSetup.js` runs once per test run and tries, in order:

1. **`SKIP_MONGO_TESTS=1`** skips database-backed suites outright.
2. **`MONGO_TEST_URI`** takes any reachable server. Use this for a local mongod, one
   in Docker, or a scratch database:
   ```bash
   MONGO_TEST_URI="mongodb://127.0.0.1:27017/nexgen-test" npm test
   ```
3. **`mongodb-memory-server`** downloads a mongod binary on first run and
   caches it in `~/.cache/mongodb-binaries`. Nothing to configure.

If none succeeds the run still passes: suites wrapped in `describeWithMongo()`
report as skipped with the reason printed once, rather than failing.

> **`clear()` empties every collection between tests but never drops the
> database**, so indexes created by `syncIndexes()` survive across tests in a
> suite.

## Writing a database-backed suite

```js
const {describeWithMongo, connect, clear, disconnect} = require('./helpers/db')
const {makeCustomer, makeDeal} = require('./helpers/factories')

describeWithMongo('my feature', () => {
    beforeAll(connect)
    afterEach(clear)
    afterAll(disconnect)

    it('does the thing', async () => {
        await Customer.create(makeCustomer({company: 'TranXenergy'}))
        // ...
    })
})
```

Use `describeWithMongo` rather than `describe` for anything that touches the
database, and `connect()` throws if you forget.

## Known environment limitation

`mongodb-memory-server` fetches from `fastdl.mongodb.org`. Where egress policy
blocks that host, set `MONGO_TEST_URI` instead. A specific mongod version can be
forced with `MONGOMS_VERSION`, and an already-installed binary reused with
`MONGOMS_SYSTEM_BINARY`.
