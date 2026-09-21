// Default pipeline stage benchmarks seeded for every brand-new company.
// These exist so scoring
// works immediately at signup (H6 AC2) — an admin can adjust them later,
// but nobody starts with an empty, non-functional configuration.

const DEFAULT_STAGE_BENCHMARKS = [
    {stage: 'Qualified', healthyMaxDays: 7, warningMaxDays: 14, highRiskMinDays: 15},
    {stage: 'Contact Made', healthyMaxDays: 10, warningMaxDays: 21, highRiskMinDays: 22},
    {stage: 'Demo Scheduled', healthyMaxDays: 14, warningMaxDays: 30, highRiskMinDays: 31},
    {stage: 'Proposal Made', healthyMaxDays: 21, warningMaxDays: 35, highRiskMinDays: 36},
    {stage: 'Negotiation', healthyMaxDays: 30, warningMaxDays: 45, highRiskMinDays: 46},
]

module.exports = {DEFAULT_STAGE_BENCHMARKS}