require('dotenv').config()
const mongoose = require('mongoose')
const User = require('../models/User')
const Team = require('../models/Team')
const Company = require('../models/Company')
const SystemSettings = require('../models/SystemSettings')

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const ensureCompanyIdsBackfilled = async () => {
    // 1. Find all users missing companyId
    const usersWithoutCompanyId = await User.find({
        $or: [{companyId: {$exists: false}}, {companyId: null}],
    })

    if (usersWithoutCompanyId.length === 0) {
        return {usersUpdated: 0, companiesCreated: 0}
    }

    let usersUpdated = 0
    let companiesCreated = 0

    // Group users by normalized company name
    const companyGroups = {}
    for (const user of usersWithoutCompanyId) {
        const rawName = (user.companyName || 'Default Company').trim()
        const key = rawName.toLowerCase()
        if (!companyGroups[key]) {
            companyGroups[key] = {displayNames: [rawName], userIds: []}
        }
        companyGroups[key].userIds.push(user._id)
    }

    for (const key of Object.keys(companyGroups)) {
        const group = companyGroups[key]
        const displayName = group.displayNames[0] || 'Default Company'

        // Find existing Company by case-insensitive name match, or create new one
        let company = await Company.findOne({
            name: new RegExp(`^${escapeRegex(displayName)}$`, 'i'),
        })

        if (!company) {
            company = await Company.create({name: displayName})
            companiesCreated++
        }

        // Update Users
        const userRes = await User.updateMany(
            {_id: {$in: group.userIds}},
            {$set: {companyId: company._id, companyName: company.name}}
        )
        usersUpdated += userRes.modifiedCount || group.userIds.length

        // Update Teams matching this company name string
        await Team.updateMany(
            {
                $or: [{companyId: {$exists: false}}, {companyId: null}],
                company: new RegExp(`^${escapeRegex(displayName)}$`, 'i'),
            },
            {$set: {companyId: company._id}}
        )

        // Update SystemSettings matching this company
        await SystemSettings.updateMany(
            {
                $or: [{companyId: {$exists: false}}, {companyId: null}],
                companyKey: key,
            },
            {$set: {companyId: company._id}}
        )
    }

    return {usersUpdated, companiesCreated}
}

const run = async () => {
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is not set')
        process.exit(1)
    }

    await mongoose.connect(process.env.MONGO_URI)
    const result = await ensureCompanyIdsBackfilled()
    console.log(
        `Backfill completed: ${result.usersUpdated} user(s) updated, ${result.companiesCreated} company(ies) created.`
    )
    await mongoose.disconnect()
}

if (require.main === module) {
    run().catch(async (err) => {
        console.error('Backfill failed:', err)
        await mongoose.disconnect().catch(() => {})
        process.exit(1)
    })
}

module.exports = {ensureCompanyIdsBackfilled}
