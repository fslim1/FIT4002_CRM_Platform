// Confirms an account by hand, for when the confirmation email could not be
// delivered and someone is left unable to log in.
//
//   node scripts/verifyUser.js someone@example.com

require('dotenv').config()
const mongoose = require('mongoose')
const User = require('../models/User')

const run = async () => {
    const email = String(process.argv[2] || '').toLowerCase().trim()
    if (!email) {
        console.error('Usage: node scripts/verifyUser.js <email>')
        process.exit(1)
    }
    if (!process.env.MONGO_URI) {
        console.error('MONGO_URI is not set')
        process.exit(1)
    }

    await mongoose.connect(process.env.MONGO_URI)

    const user = await User.findOne({email})
    if (!user) {
        console.error(`No account found for ${email}`)
        await mongoose.disconnect()
        process.exit(1)
    }

    if (user.emailVerified) {
        console.log(`${email} is already confirmed.`)
    } else {
        user.emailVerified = true
        user.emailVerification = {codeHash: null, expiresAt: null, attempts: 0, sentAt: null}
        await user.save()
        console.log(`${email} is now confirmed and can log in.`)
    }

    await mongoose.disconnect()
}

run().catch(async (err) => {
    console.error('Failed to confirm the account:', err)
    await mongoose.disconnect().catch(() => {
    })
    process.exit(1)
})
