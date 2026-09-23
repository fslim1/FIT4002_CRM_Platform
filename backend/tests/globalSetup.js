// Skip database tests, use MONGO_TEST_URI, or start an in-memory server.

const STARTUP_BUDGET_MS = 90000

const withTimeout = (promise, ms) =>
    Promise.race([
        promise,
        new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms).unref()
        ),
    ])

const assertScratchDatabase = (uri) => {
    if (process.env.ALLOW_UNSAFE_TEST_DB === '1') return

    let dbName
    try {
        dbName = decodeURIComponent(new URL(uri).pathname.replace(/^\//, '')).split('?')[0]
    } catch {
        throw new Error(`MONGO_TEST_URI is not a valid connection string: ${uri}`)
    }

    if (dbName === '' || /test/i.test(dbName)) return

    throw new Error(
        `Refusing to run tests against database "${dbName}": the suite deletes ` +
        'every document in it. Point MONGO_TEST_URI at a disposable database ' +
        'whose name contains "test", or set ALLOW_UNSAFE_TEST_DB=1 if certain.'
    )
}

const startMemoryServer = async () => {
    const {MongoMemoryServer} = require('mongodb-memory-server')
    const server = await MongoMemoryServer.create()
    return {uri: server.getUri(), server}
}

const quietly = async (fn) => {
    const {error, warn} = console
    console.error = () => {}
    console.warn = () => {}
    try {
        return await fn()
    } finally {
        console.error = error
        console.warn = warn
    }
}

module.exports = async function globalSetup() {
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

    let abandoned = false
    const attempt = startMemoryServer()
    attempt.then(
        ({server}) => {
            if (abandoned && server) server.stop().catch(() => {})
        },
        () => {}
    )

    try {
        const {uri, server} = await quietly(() => withTimeout(attempt, STARTUP_BUDGET_MS))
        process.env.MONGO_TEST_URI = uri
        process.env.MONGO_TEST_AVAILABLE = '1'
        globalThis.__MONGOD__ = server
    } catch (err) {
        abandoned = true
        process.env.MONGO_TEST_AVAILABLE = '0'
        console.warn(
            '\n[tests] No mongod available, so database-backed suites will be skipped.' +
            `\n[tests] Reason: ${String(err.message).split('\n')[0]}` +
            '\n[tests] Set MONGO_TEST_URI to a reachable mongod to run them.\n'
        )
    }
}
