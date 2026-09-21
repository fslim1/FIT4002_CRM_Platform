const mongoose = require('mongoose')

// One computed risk result per deal, per company. Recomputed fresh on every
// GET /api/deals/:id/risk-score call (see routes/dealRoutes.js) — this
// document stores the most recent result for history/reporting, but is
// never treated as a cache that could go stale, satisfying H7 AC3.
const dealRiskScoreSchema = new mongoose.Schema(
    {
        companyKey: {type: String, required: true, trim: true, lowercase: true, index: true},
        deal: {type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true},
        riskLevel: {type: String, enum: ['Low', 'Medium', 'High'], default: 'Low'},
        points: {type: Number, default: 0},
        factors: {
            daysInStage: {type: Number},
            daysSinceActivity: {type: Number, default: null},
            neverContacted: {type: Boolean, default: false},
            overdueTaskCount: {type: Number},
        },
        reasons: [{type: String}],
        calculatedAt: {type: Date, default: Date.now},
    },
    {timestamps: true}
)

dealRiskScoreSchema.index({companyKey: 1, deal: 1}, {unique: true})

module.exports = mongoose.model('DealRiskScore', dealRiskScoreSchema)