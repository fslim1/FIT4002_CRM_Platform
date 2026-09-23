const {execFile} = require('child_process')
const path = require('path')
const express = require('express')
const request = require('supertest')

const app = require('../app')

// Every API router mounted in app.js, paired with a probe that reaches the
// router without touching the database. A 401 proves the router is mounted and
// its auth middleware ran; an unmounted path 404s instead (see the control
// below), so these assertions fail loudly if a mount is ever dropped.
const MOUNT_PROBES = [
    {mount: '/api/auth', method: 'get', probe: '/api/auth/config', expected: 200},
    {mount: '/api/admin', method: 'get', probe: '/api/admin/users', expected: 401},
    {mount: '/api/customers', method: 'get', probe: '/api/customers', expected: 401},
    {mount: '/api/interactions', method: 'delete', probe: '/api/interactions/abc123', expected: 401},
    {mount: '/api/deals', method: 'get', probe: '/api/deals', expected: 401},
    {mount: '/api/tasks', method: 'get', probe: '/api/tasks', expected: 401},
    {mount: '/api/notifications', method: 'get', probe: '/api/notifications', expected: 401},
    {mount: '/api/users', method: 'get', probe: '/api/users', expected: 401},
    {mount: '/api/teams', method: 'get', probe: '/api/teams', expected: 401},
    {mount: '/api/settings', method: 'get', probe: '/api/settings', expected: 401},
    {mount: '/api/portal', method: 'get', probe: '/api/portal/me', expected: 401},
    {mount: '/api/dashboard', method: 'get', probe: '/api/dashboard', expected: 401},
    {mount: '/api/risk-benchmarks', method: 'get', probe: '/api/risk-benchmarks', expected: 401},
    {
        mount: '/api/relationship-graph',
        method: 'get',
        probe: '/api/relationship-graph/account/507f1f77bcf86cd799439011',
        expected: 401,
    },
]

describe('app.js: the Express app, built without a listener', () => {
    it('serves the health root', async () => {
        const res = await request(app).get('/')
        expect(res.status).toBe(200)
        expect(res.text).toBe('NexGen CRM backend is running')
    })

    it('still applies helmet to responses', async () => {
        const res = await request(app).get('/')
        expect(res.headers['x-content-type-options']).toBe('nosniff')
    })

    it('exports an Express app rather than a running server', () => {
        expect(typeof app).toBe('function')
        expect(typeof app.listen).toBe('function')
        // Same module instance on re-require: app.js has no per-call factory.
        expect(require('../app')).toBe(app)
    })

    // The whole point of splitting app.js out of server.js: importing it must
    // not bind a port. A child process that only requires app.js therefore has
    // nothing keeping its event loop alive and must exit on its own.
    it('does not bind a port when required', async () => {
        const exitCode = await new Promise((resolve, reject) => {
            const child = execFile(
                process.execPath,
                ['-e', "require('./app')"],
                {cwd: path.join(__dirname, '..'), timeout: 10000},
                (err) => {
                    if (err && err.killed) return reject(new Error('requiring app.js kept the process alive, so it is binding a port'))
                    if (err) return reject(err)
                    resolve(0)
                }
            )
            child.on('error', reject)
        })
        expect(exitCode).toBe(0)
    })
})

describe('app.js: route mounts', () => {
    it.each(MOUNT_PROBES)(
        'mounts $mount (probe: $method $probe)',
        async ({method, probe, expected}) => {
            const res = await request(app)[method](probe)
            expect(res.status).toBe(expected)
        }
    )

    // Control: makes the 401s above meaningful. An unmounted path returns 404,
    // so a dropped mount could not masquerade as a passing probe.
    it('404s a path with no router mounted under it', async () => {
        const res = await request(app).get('/api/no-such-mount')
        expect(res.status).toBe(404)
    })
})

describe('app.js: the relationship graph is read-only', () => {
    const accountPath = '/api/relationship-graph/account/507f1f77bcf86cd799439011'

    it.each(['post', 'put', 'patch', 'delete'])(
        'exposes no %s route on the graph endpoint',
        async (method) => {
            const res = await request(app)[method](accountPath)
            // 404, not 401: the verb does not exist at all, so there is no
            // write path to reach even with a valid token.
            expect(res.status).toBe(404)
        }
    )
})

describe('app.js: error handling', () => {
    it('answers 400 with a useful message when the body is not valid JSON', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('{"email": broken')

        expect(res.status).toBe(400)
        expect(typeof res.body.message).toBe('string')
        expect(res.body.message.length).toBeGreaterThan(0)
    })

    it('answers 413 when the body is larger than the limit', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({padding: 'x'.repeat(200 * 1024)}))

        expect(res.status).toBe(413)
    })

    it('answers 403 for a browser origin that is not allowed', async () => {
        const res = await request(app).get('/').set('Origin', 'https://not-allowed.example')

        expect(res.status).toBe(403)
        expect(res.body.message).toMatch(/origin/i)
    })

    it('allows a configured origin through', async () => {
        const res = await request(app).get('/').set('Origin', 'http://localhost:5173')
        expect(res.status).toBe(200)
    })

    it('answers 500 without describing the failure when nothing sets a status', async () => {
        // A fault on our side must not hand the caller an internal message,
        // which could name the database or the file system.
        const probe = express()
        probe.get('/boom', () => {
            throw new Error('connection reset to cluster-7.internal')
        })
        // Same handler the app installs, applied to a throwaway router.
        probe.use((err, req, res, next) => {
            if (res.headersSent) return next(err)
            const status = err.status || err.statusCode || 500
            res.status(status).json({
                message: status >= 500 ? 'Internal server error' : err.message,
            })
        })

        const res = await request(probe).get('/boom')
        expect(res.status).toBe(500)
        expect(res.body).toEqual({message: 'Internal server error'})
    })
})

describe('app.js: authentication middleware', () => {
    it('rejects a request with no bearer token', async () => {
        const res = await request(app).get('/api/customers')
        expect(res.status).toBe(401)
        expect(res.body).toEqual({message: 'Authentication required'})
    })

    it('rejects a malformed bearer token', async () => {
        const res = await request(app)
            .get('/api/customers')
            .set('Authorization', 'Bearer not-a-real-jwt')
        expect(res.status).toBe(401)
        expect(res.body).toEqual({message: 'Invalid or expired token'})
    })
})
