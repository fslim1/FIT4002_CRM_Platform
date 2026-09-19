/**
 * server.js — Entry point.
 *
 * Imports the configured Express app from app.js and binds it to a port.
 * All middleware, routes, and DB setup live in app.js so that tests can
 * import the app without starting a live server.
 */

const app = require('./app')

const PORT = process.env.PORT || 5001
app.listen(PORT, () => console.log(`Server running on port ${PORT}`))