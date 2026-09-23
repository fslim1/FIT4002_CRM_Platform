// Runs before every test file, ahead of any require('../app').
process.env.NODE_ENV = 'test'
// auth.js throws when JWT_SECRET is unset; give the suite a deterministic one.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-do-not-use-in-production'
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h'
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173'
// The app must never dial a real database from a test.
delete process.env.MONGO_URI
