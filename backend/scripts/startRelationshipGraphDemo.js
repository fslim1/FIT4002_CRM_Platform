const {requireDemoTarget, printDemoTarget} = require('./relationshipGraphDemoConfig')

try {
    const target = requireDemoTarget()
    printDemoTarget(target)
    console.log('Starting the backend with the isolated Relationship Graph demo database')

    // server.js loads .env, but dotenv does not replace an existing value.
    process.env.MONGO_URI = target.raw
    require('../server')
} catch (error) {
    console.error(error.message)
    process.exitCode = 1
}
