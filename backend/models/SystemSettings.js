const mongoose = require('mongoose')

// Per-company configuration document. Each company gets its own
// settings, keyed by the normalized company name, so one company's admin can
// never change another company's configuration.
const systemSettingsSchema = new mongoose.Schema(
    {
        // Normalized (lowercased) company name this document belongs to.
        companyKey: {
            type: String,
            trim: true,
            lowercase: true,
            maxlength: 120,
            default: null,
            unique: true,
            sparse: true,
        },
        companyName: {
            type: String,
            trim: true,
            maxlength: 120,
            default: 'NexGen CRM',
        },
        timezone: {
            type: String,
            trim: true,
            maxlength: 64,
            default: 'Asia/Kuala_Lumpur',
        },
        currency: {
            type: String,
            trim: true,
            maxlength: 8,
            default: 'MYR',
        },
        language: {
            type: String,
            trim: true,
            maxlength: 40,
            default: 'English',
        },
    },
    {timestamps: true}
)

// Returns (creating if needed) the settings document for a company. The very
// first company to read settings adopts the legacy pre-multi-company
// singleton, so configuration saved before company scoping is preserved.
systemSettingsSchema.statics.getForCompany = async function (companyName) {
    const name = (companyName || '').trim()
    const key = name.toLowerCase()

    let doc = await this.findOne({companyKey: key})
    if (doc) return doc

    doc = await this.findOneAndUpdate(
        {companyKey: null},
        {companyKey: key, ...(name ? {companyName: name} : {})},
        {new: true}
    )
    if (doc) return doc

    return this.create({companyKey: key, companyName: name || 'NexGen CRM'})
}

module.exports = mongoose.model('SystemSettings', systemSettingsSchema)
