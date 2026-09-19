const mongoose = require('mongoose')

// One computed risk result per deal, per company. this model only establishes correct
// company scoping up front so nothing needs retrofitting later.
const dealRiskScoreSchema = new mongoose.Schema(
    {
        companyKey: {type: String, required: true, trim: true, lowercase: true, index: true},
        deal: {type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true},
        riskLevel: {type: String, enum: ['Low', 'Medium', 'High'], default: 'Low'},
        reasons: [{type: String}],
        calculatedAt: {type: Date, default: Date.now},
    },
    {timestamps: true}
)

dealRiskScoreSchema.index({companyKey: 1, deal: 1}, {unique: true})

module.exports = mongoose.model('DealRiskScore', dealRiskScoreSchema)