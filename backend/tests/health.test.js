/**
 * Health check tests — GET /
 *
 * Tests the root endpoint that the existing CI smoke test already checks.
 * Ensures the Express app itself starts and responds correctly.
 */

const request = require('supertest')

// Import the app *after* setup.js has set the env vars.
// server.js calls app.listen(), so we need to export just the app.
// We import server.js but capture the express app via a thin helper.
const app = require('../app')

describe('GET / — Health check', () => {
    it('should return 200 with the expected text body', async () => {
        const res = await request(app).get('/')
        expect(res.status).toBe(200)
        expect(res.text).toContain('NexGen CRM backend is running')
    })

    it('should return 404 for an unknown route', async () => {
        const res = await request(app).get('/api/does-not-exist')
        expect(res.status).toBe(404)
    })
})
