// A server supplied through MONGO_TEST_URI is not owned by this test run.
module.exports = async function globalTeardown() {
    const server = globalThis.__MONGOD__
    if (!server) return

    await server.stop()
    globalThis.__MONGOD__ = undefined
}
