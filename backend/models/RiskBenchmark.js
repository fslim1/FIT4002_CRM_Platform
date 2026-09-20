const mongoose = require('mongoose')

// Per-company, per-deal-type stage benchmarks for AI Deal Risk Scoring.
// companyKey ties every row to exactly one company (see middleware/companyScope.js).
// Anything at or under healthyMaxDays is healthy; between healthyMaxDays and
// warningMaxDays is a warning; at or beyond highRiskMinDays is high risk.
const riskBenchmarkSchema = new mongoose.Schema(
    {
        companyKey: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            index: true,
        },
        // Kept for display/debugging only — companyKey is what queries filter by.
        companyName: {
            type: String,
            trim: true,
            maxlength: 120,
        },
        dealType: {
            type: String,
            trim: true,
            maxlength: 80,
            default: 'Standard',
        },
        stage: {
            type: String,
            required: true,
            enum: ['Qualified', 'Contact Made', 'Demo Scheduled', 'Proposal Made', 'Negotiation'],
        },
        healthyMaxDays: {type: Number, required: true, min: 0},
        warningMaxDays: {type: Number, required: true, min: 0},
        highRiskMinDays: {type: Number, required: true, min: 0},
    },
    {timestamps: true}
)

// One benchmark row per company + deal type + stage.
riskBenchmarkSchema.index({companyKey: 1, dealType: 1, stage: 1}, {unique: true})

module.exports = mongoose.model('RiskBenchmark', riskBenchmarkSchema)