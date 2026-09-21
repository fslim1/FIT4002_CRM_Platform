// One-off migration for databases created before sign-up confirmation
// existed. Accounts from that time have no emailVerified field and would
// otherwise be treated as unconfirmed and locked out of logging in.
//
// Run once against each environment:  node scripts/backfillEmailVerified.js

require('dotenv').config()
const mongoose = require('mongoose')
const User = require('../models/User')

const run = async () => {
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is not set')
        process.exit(1)
    }

    await mongoose.connect(process.env.MONGO_URI)

    const {modifiedCount} = await User.updateMany(
        {emailVerified: {$exists: false}},
        {$set: {emailVerified: true}}
    )

    console.log(`Marked ${modifiedCount} existing account(s) as verified.`)
    await mongoose.disconnect()
}

run().catch(async (err) => {
    console.error('Backfill failed:', err)
    await mongoose.disconnect().catch(() => {
    })
    process.exit(1)
})
