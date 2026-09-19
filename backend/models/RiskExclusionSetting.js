const mongoose = require('mongoose')

// Which deal types are excluded, paused, or use a separate benchmark set for
// a given company (client's Section 8). Admin-configured; a Supervisor's
// proposed deal-type change is stored elsewhere pending approval — this
// model only holds the final, approved setting.
const riskExclusionSettingSchema = new mongoose.Schema(
    {
        companyKey: {type: String, required: true, trim: true, lowercase: true, index: true},
        dealType: {type: String, required: true, trim: true, maxlength: 80},
        mode: {
            type: String,
            enum: ['scored', 'separateBenchmark', 'paused', 'excluded'],
            default: 'scored',
        },
    },
    {timestamps: true}
)

riskExclusionSettingSchema.index({companyKey: 1, dealType: 1}, {unique: true})

module.exports = mongoose.model('RiskExclusionSetting', riskExclusionSettingSchema)