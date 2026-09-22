const mongoose = require('mongoose')

// Per-company configuration document. Each company gets its own
// settings, keyed by the normalized company name, so one company's admin can
// never change another company's configuration.
const systemSettingsSchema = new mongoose.Schema(
    {
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Company',
            index: true,
            sparse: true,
        },
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

// Returns (creating if needed) the settings document for a company.
systemSettingsSchema.statics.getForCompany = async function (userOrName, companyIdArg) {
    let name = ''
    let companyId = companyIdArg || null

    if (userOrName && typeof userOrName === 'object') {
        name = (userOrName.companyName || '').trim()
        companyId = userOrName.companyId || companyId
    } else if (typeof userOrName === 'string') {
        name = userOrName.trim()
    }
    const key = name.toLowerCase()

    let doc = null
    if (companyId) {
        doc = await this.findOne({companyId})
    }
    if (!doc && key) {
        doc = await this.findOne({companyKey: key})
    }
    if (doc) {
        if (companyId && !doc.companyId) {
            doc.companyId = companyId
            await doc.save()
        }
        return doc
    }

    doc = await this.findOneAndUpdate(
        {companyKey: null, companyId: null},
        {companyKey: key || null, companyId, ...(name ? {companyName: name} : {})},
        {new: true}
    )
    if (doc) return doc

    return this.create({
        companyId,
        companyKey: key || null,
        companyName: name || 'NexGen CRM',
    })
}

module.exports = mongoose.model('SystemSettings', systemSettingsSchema)
