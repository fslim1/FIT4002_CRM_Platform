/**
 * Vitest setupFiles — runs once per test suite (file).
 *
 * Starts a fresh in-memory MongoDB instance for EACH test suite and connects
 * Mongoose to it. This guarantees perfect isolation between test files.
 *
 * The real MONGO_URI from .env is NEVER used during tests.
 * app.js is guarded with NODE_ENV === 'test' so it skips its own connect().
 */

const { MongoMemoryServer } = require('mongodb-memory-server')
const mongoose = require('mongoose')

let mongod

beforeAll(async () => {
    process.env.NODE_ENV = 'test'
    process.env.JWT_SECRET = 'test-jwt-secret-do-not-use-in-production'
    process.env.JWT_EXPIRES_IN = '1h'

    mongod = await MongoMemoryServer.create({
        binary: { version: '7.0.0' }
    })
    const uri = mongod.getUri()
    process.env.MONGO_URI = uri

    await mongoose.connect(uri)
})

afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.dropDatabase()
        await mongoose.connection.close()
    }
    if (mongod) {
        await mongod.stop()
    }
})
