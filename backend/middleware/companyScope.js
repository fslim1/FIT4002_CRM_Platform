// Shared company-scoping helpers for the AI Deal Risk Scoring feature.
//
// Companies are identified by
// companyName, matched case-insensitively (see teamScope.js). To stay
// consistent, every new risk-scoring record is scoped by `companyKey`, the
// same normalized (trimmed, lowercased) key already used by
// SystemSettings.companyKey. This guarantees one company's benchmarks,
// scores, weights and exclusions can never be read or written by another.

const getCompanyKey = (user) => (user?.companyName || '').trim().toLowerCase()

// Mongo filter restricting a query to the requester's own company.
// Always spread `extra` last so a caller-supplied companyKey can never
// override the requester's real one.
const companyScopeFilter = (user, extra = {}) => ({
    ...extra,
    companyKey: getCompanyKey(user),
})

module.exports = {getCompanyKey, companyScopeFilter}