/**
 * Admin Bootstrap Seeder
 * ======================
 * Creates the initial Admin user from environment variables.
 * Run once with:  npm run seed:admin
 *
 * Required .env variables:
 *   ADMIN_EMAIL     Work email for the admin account
 *   ADMIN_PASSWORD  Temporary password (must meet the shared password rules)
 *   ADMIN_FULLNAME  Display name
 *   ADMIN_COMPANY   Company name (all admin-managed users share this)
 *
 * This script is idempotent: if an account with ADMIN_EMAIL already exists it
 * prints a message and exits cleanly without modifying the existing record.
 */

const mongoose = require('mongoose')
const dotenv = require('dotenv')
const User = require('../models/User')
const {validatePassword} = require('../services/passwordPolicy')

dotenv.config()

const {
    MONGO_URI,
    ADMIN_EMAIL,
    ADMIN_PASSWORD,
    ADMIN_FULLNAME,
    ADMIN_COMPANY,
} = process.env

const requiredVars = {MONGO_URI, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FULLNAME, ADMIN_COMPANY}
const missing = Object.entries(requiredVars)
    .filter(([, v]) => !v)
    .map(([k]) => k)

if (missing.length > 0) {
    console.error(`Missing required environment variables: ${missing.join(', ')}`)
    console.error('Set them in backend/.env before running this script.')
    process.exit(1)
}

const passwordCheck = validatePassword(ADMIN_PASSWORD)
if (!passwordCheck.ok) {
    console.error(`${passwordCheck.message}.`)
    process.exit(1)
}

const Company = require('../models/Company')

const run = async () => {
    try {
        await mongoose.connect(MONGO_URI)
        console.log('MongoDB connected.')

        const companyName = ADMIN_COMPANY.trim()
        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        let company = await Company.findOne({
            name: new RegExp(`^${escapeRegex(companyName)}$`, 'i'),
        })
        if (!company) {
            company = await Company.create({name: companyName})
        }

        const existing = await User.findOne({email: ADMIN_EMAIL.toLowerCase()})
        if (existing) {
            if (!existing.companyId) {
                existing.companyId = company._id
                await existing.save()
            }
            console.log(`Admin account already exists for ${ADMIN_EMAIL}. No changes made.`)
            return
        }

        const admin = await User.create({
            fullName: ADMIN_FULLNAME.trim(),
            email: ADMIN_EMAIL.toLowerCase().trim(),
            password: ADMIN_PASSWORD,
            companyId: company._id,
            companyName: company.name,
            role: 'Admin',
            authProvider: 'local',
            // The seeder runs offline against the database, with no mail
            // relay to send a confirmation code through, so the bootstrap
            // account is usable straight away.
            emailVerified: true,
        })

        console.log(`Admin created successfully:`)
        console.log(`  Name:    ${admin.fullName}`)
        console.log(`  Email:   ${admin.email}`)
        console.log(`  Company: ${admin.companyName}`)
        console.log(`  Role:    ${admin.role}`)
        console.log(`\nYou can now log in at /login with these credentials.`)
        console.log(`Delete or rotate ADMIN_PASSWORD from .env after first login.`)
    } catch (err) {
        console.error('Seeding failed:', err)
        process.exit(1)
    } finally {
        await mongoose.disconnect()
        process.exit(0)
    }
}

run()
