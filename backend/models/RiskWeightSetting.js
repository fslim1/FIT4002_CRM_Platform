const mongoose = require('mongoose')

// Flexible per-company configuration for anything that doesn't fit
// RiskBenchmark's fixed shape — e.g. inactivity thresholds, overdue-task
// rulesets (client's Sections 2 and 3). `key` names the setting; `value`
// holds whatever shape that setting needs, refined as later stories define
// each ruleset. companyKey scoping is already correct from day one.
const riskWeightSettingSchema = new mongoose.Schema(
    {
        companyKey: {type: String, required: true, trim: true, lowercase: true, index: true},
        key: {type: String, required: true, trim: true, maxlength: 80},
        value: {type: mongoose.Schema.Types.Mixed, required: true},
    },
    {timestamps: true}
)

riskWeightSettingSchema.index({companyKey: 1, key: 1}, {unique: true})

module.exports = mongoose.model('RiskWeightSetting', riskWeightSettingSchema)