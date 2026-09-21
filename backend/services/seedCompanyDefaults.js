const RiskBenchmark = require('../models/RiskBenchmark')
const {DEFAULT_STAGE_BENCHMARKS} = require('./defaultRiskBenchmarks')

// Seeds default "Standard" deal-type benchmarks for a brand-new company.
// Safe to call on every signup — it only writes if this company genuinely
// has none yet, so it never overwrites an existing admin's configuration.
const seedCompanyRiskBenchmarksIfNew = async (companyName) => {
    const companyKey = (companyName || '').trim().toLowerCase()
    if (!companyKey) return

    const existing = await RiskBenchmark.findOne({companyKey})
    if (existing) return // Not a new company — never touch existing config.

    const docs = DEFAULT_STAGE_BENCHMARKS.map((b) => ({
        companyKey,
        companyName: (companyName || '').trim(),
        dealType: 'Standard',
        ...b,
    }))

    try {
        await RiskBenchmark.insertMany(docs, {ordered: false})
    } catch (err) {
        // A duplicate-key race (two signups for the same new company at once)
        // is harmless here — whichever request wins, benchmarks now exist.
        if (err.code !== 11000) {
            console.error('Failed to seed default risk benchmarks:', err)
        }
    }
}

module.exports = {seedCompanyRiskBenchmarksIfNew}