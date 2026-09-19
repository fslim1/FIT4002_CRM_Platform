/**
 * Jest global teardown — runs ONCE after the entire test run.
 * Stops the MongoMemoryServer started in globalSetup.js.
 */

module.exports = async function globalTeardown() {
    if (global.__MONGOD__) {
        await global.__MONGOD__.stop()
    }
}
