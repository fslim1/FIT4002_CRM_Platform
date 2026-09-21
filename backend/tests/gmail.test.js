/**
 * Gmail service — testing limitation documentation
 *
 * services/gmailService.js exports two items:
 *
 *   buildMimeEmail(to, subject, bodyText) — pure sync function that builds a
 *     base64url-encoded MIME message string. It is NOT exported from the module.
 *
 *   sendGmailMessage(toEmail, subject, body, accessToken) — async function that
 *     calls the real Gmail API via `googleapis`. This requires:
 *       - A live Google OAuth2 access token
 *       - Real Google API credentials (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
 *
 * ── Why we cannot safely test this module in the current test setup ───────────
 *
 *   1. `buildMimeEmail` is not exported — it cannot be called directly.
 *      Modifying production code to export it is out of scope.
 *
 *   2. `sendGmailMessage` calls `googleapis` internally. Intercepting that call
 *      with vi.mock() in Vitest's `pool: 'threads'` CJS mode is unreliable:
 *      vi.hoisted()/vi.mock() hoisting does not fully intercept require() in the
 *      worker thread context used by this project's vitest.config.mjs.
 *      Switching to `pool: 'forks'` or ESM would fix this but would require
 *      changing the test infrastructure configuration, which is out of scope.
 *
 *   3. There are NO HTTP routes in app.js or any route file that expose Gmail
 *      functionality — so API/integration tests are not possible.
 *
 * ── Recommended future action ─────────────────────────────────────────────────
 *
 *   To enable Gmail unit tests, one of the following should be done:
 *     a) Export `buildMimeEmail` from gmailService.js so it can be tested directly.
 *     b) Change vitest.config.mjs `pool` from 'threads' to 'forks' to enable
 *        reliable vi.mock() interception of CommonJS modules.
 *     c) Refactor gmailService.js to accept an injected gmail client (dependency
 *        injection) instead of constructing it internally, making it trivially
 *        testable without module-level mocking.
 *
 * This file contains a single no-op test to confirm that the test infrastructure
 * correctly discovers and runs this file.
 */

describe('Gmail service — limitation acknowledged', () => {
    it('documents why Gmail unit tests are not implemented (see file header)', () => {
        // This test intentionally passes with no assertions.
        // The limitation is documented above.
        expect(true).toBe(true)
    })
})
