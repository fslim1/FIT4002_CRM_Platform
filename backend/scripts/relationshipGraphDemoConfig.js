const EXPECTED_DATABASE = 'fit4002_relationship_graph_demo'
const EXPECTED_PORT = '27018'
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

const requireDemoTarget = () => {
    if (process.env.NODE_ENV !== 'development') {
        throw new Error('Refusing demo access unless NODE_ENV=development')
    }

    const raw = process.env.DEMO_MONGO_URI
    if (!raw) {
        throw new Error('DEMO_MONGO_URI is required; the normal MONGO_URI is never used')
    }

    let parsed
    try {
        parsed = new URL(raw)
    } catch {
        throw new Error('DEMO_MONGO_URI is not a valid MongoDB connection string')
    }

    if (parsed.protocol !== 'mongodb:') {
        throw new Error('The demo requires a local mongodb:// connection, not Atlas or SRV')
    }
    if (!LOCAL_HOSTS.has(parsed.hostname)) {
        throw new Error(`Refusing non-local MongoDB host: ${parsed.hostname}`)
    }
    if (parsed.port !== EXPECTED_PORT) {
        throw new Error(`Refusing MongoDB port "${parsed.port || '(default)'}"; expected ${EXPECTED_PORT}`)
    }

    const database = parsed.pathname.replace(/^\//, '')
    if (database !== EXPECTED_DATABASE) {
        throw new Error(
            `Refusing database "${database || '(unspecified)'}"; expected "${EXPECTED_DATABASE}"`
        )
    }

    return {
        raw,
        host: `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`,
        database,
    }
}

const printDemoTarget = (target) => {
    console.log(`Target host: ${target.host}`)
    console.log(`Target database: ${target.database}`)
}

module.exports = {EXPECTED_DATABASE, requireDemoTarget, printDemoTarget}
