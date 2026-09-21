// Stops the in-memory mongod started by globalSetup, if there was one. A server
// supplied through MONGO_TEST_URI is left alone, since the test run does not own it.
module.exports = async () => {
    const server = globalThis.__MONGOD__
    if (server) {
        await server.stop()
        globalThis.__MONGOD__ = undefined
    }
}
