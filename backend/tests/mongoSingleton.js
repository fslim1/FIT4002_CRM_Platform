/**
 * Singleton module that owns the MongoMemoryServer instance.
 *
 * Because Node.js caches modules, this file is loaded exactly once per
 * process no matter how many test files require it. All suites therefore
 * share the same in-memory MongoDB server.
 */

const { MongoMemoryServer } = require('mongodb-memory-server')

let mongod = null
let uri = null

async function start() {
    if (mongod) return uri          // already started — return cached URI
    mongod = await MongoMemoryServer.create()
    uri = mongod.getUri()
    return uri
}

async function stop() {
    if (!mongod) return
    await mongod.stop()
    mongod = null
    uri = null
}

module.exports = { start, stop }
