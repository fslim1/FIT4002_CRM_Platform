// Resolves a mongod once per test run, in this order:
//
//   1. SKIP_MONGO_TESTS=1      skip database-backed suites outright
//   2. MONGO_TEST_URI          any reachable server (local, docker, scratch Atlas)
//   3. mongodb-memory-server   downloads a mongod binary on first use
//
// When none is available the run still succeeds: database-backed suites are
// skipped via describeWithMongo() in tests/helpers/db.js rather than failing.
// This keeps `npm test` usable on machines whose network blocks
// fastdl.mongodb.org, which is where mongodb-memory-server fetches from.

const STARTUP_BUDGET_MS = 90000

const withTimeout = (promise, ms) =>
    Promise.race([
        promise,
        new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref()
        ),
    ])

// The suite empties every collection between tests and calls syncIndexes(),
// which drops indexes a schema no longer declares. Pointed at a real database
// that destroys data, so a supplied URI must name an obviously disposable one.
// Checked before anything connects, and deliberately outside the try/catch
// below: a misconfigured URI is an error to surface, not a reason to skip.
const assertScratchDatabase = (uri) => {
    if (process.env.ALLOW_UNSAFE_TEST_DB === '1') return

    let dbName
    try {
        dbName = decodeURIComponent(new URL(uri).pathname.replace(/^\//, '')).split('?')[0]
    } catch {
        throw new Error(`MONGO_TEST_URI is not a valid connection string: ${uri}`)
    }

    // No database in the URI means the driver's default, which is already "test".
    if (dbName === '' || /test/i.test(dbName)) return

    throw new Error(
        `Refusing to run tests against database "${dbName}": the suite deletes ` +
        'every document in it and rewrites its indexes. Point MONGO_TEST_URI at a ' +
        'disposable database whose name contains "test", or set ' +
        'ALLOW_UNSAFE_TEST_DB=1 if you are certain.'
    )
}

const resolveMongo = async () => {
    const {MongoMemoryServer} = require('mongodb-memory-server')
    const server = await MongoMemoryServer.create()
    return {uri: server.getUri(), server}
}

// mongodb-memory-server prints a full stack trace to the console before it
// throws. That failure is expected and handled here, and left unmuted it makes
// a passing run look like a broken one, so console output is collected during
// the probe and the reason is re-reported below in one line.
const quietly = async (fn) => {
    const {error, warn} = console
    console.error = () => {
    }
    console.warn = () => {
    }
    try {
        return await fn()
    } finally {
        console.error = error
        console.warn = warn
    }
}

module.exports = async () => {
    if (process.env.SKIP_MONGO_TESTS === '1') {
        console.warn('\n[tests] Database-backed suites skipped: SKIP_MONGO_TESTS=1.\n')
        process.env.MONGO_TEST_AVAILABLE = '0'
        return
    }

    if (process.env.MONGO_TEST_URI) {
        assertScratchDatabase(process.env.MONGO_TEST_URI)
        process.env.MONGO_TEST_AVAILABLE = '1'
        return
    }

    // If the start-up budget expires the attempt keeps running, so a mongod
    // that turns up late would be orphaned for the rest of the session. Stop it
    // if that happens. The handler no-ops when the race was won normally.
    let abandoned = false
    const attempt = resolveMongo()
    attempt.then(
        (result) => {
            if (abandoned && result && result.server) result.server.stop().catch(() => {
            })
        },
        () => {
        }
    )

    try {
        const {uri, server} = await quietly(() => withTimeout(attempt, STARTUP_BUDGET_MS))
        process.env.MONGO_TEST_URI = uri
        process.env.MONGO_TEST_AVAILABLE = '1'
        globalThis.__MONGOD__ = server
        return
    } catch (err) {
        abandoned = true
        console.warn(
            '\n[tests] No mongod available, so database-backed suites will be skipped.' +
            `\n[tests] Reason: ${String(err.message).split('\n')[0]}` +
            '\n[tests] Set MONGO_TEST_URI to a reachable mongod to run them.\n'
        )
    }

    process.env.MONGO_TEST_AVAILABLE = '0'
}
