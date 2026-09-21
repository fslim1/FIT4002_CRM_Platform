const mongoose = require('mongoose')

// Flexible per-company scoring configuration. `key` names which setting this
// is (see services/defaultRiskWeights.js for the known keys and shapes);
// `value` holds whatever shape that particular setting needs. Scoped by
// companyKey exactly like RiskBenchmark, so one company's weights can never
// affect another's (same guarantee H1 established).
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