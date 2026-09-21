const mongoose = require('mongoose')

// Helpers for database-backed suites. globalSetup.js has already resolved a
// mongod (or established that there is none) by the time these run.

const mongoAvailable = () => process.env.MONGO_TEST_AVAILABLE === '1'

// Use in place of `describe` for any suite that touches the database, so the
// suite is skipped loudly rather than silently when no mongod could be resolved:
//
//   describeWithMongo('relationship graph access', () => { ... })
//
const describeWithMongo = (name, fn) =>
    mongoAvailable()
        ? describe(name, fn)
        : describe.skip(`${name} (skipped: no mongod available)`, fn)

const connect = async () => {
    if (!mongoAvailable()) {
        throw new Error(
            'connect() called without a mongod. Wrap the suite in describeWithMongo().'
        )
    }
    if (mongoose.connection.readyState === 1) return mongoose.connection
    await mongoose.connect(process.env.MONGO_TEST_URI)
    return mongoose.connection
}

// Empties every collection without dropping indexes, so each test starts from a
// known state but the schema's indexes stay in place.
const clear = async () => {
    if (mongoose.connection.readyState !== 1) return
    const collections = await mongoose.connection.db.collections()
    await Promise.all(collections.map((c) => c.deleteMany({})))
}

const disconnect = async () => {
    if (mongoose.connection.readyState === 0) return
    await mongoose.disconnect()
}

module.exports = {mongoAvailable, describeWithMongo, connect, clear, disconnect}
