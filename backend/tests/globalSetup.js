/**
 * Jest global setup — runs ONCE before the entire test run in a separate
 * Node context.  Starts the MongoMemoryServer and writes the URI to an
 * environment variable that all worker processes inherit.
 *
 * This is the cleanest way to share one in-memory MongoDB across multiple
 * test suites without connection conflicts.
 */

const { MongoMemoryServer } = require('mongodb-memory-server')

module.exports = async function globalSetup() {
    const mongod = await MongoMemoryServer.create()
    const uri = mongod.getUri()

    // Attach the instance to global so globalTeardown can stop it.
    global.__MONGOD__ = mongod

    // Pass the URI to test suites via environment variable.
    process.env.MONGO_URI_TEST = uri
}
