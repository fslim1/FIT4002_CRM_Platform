// Tests the SMTP settings in .env without going through a sign-up.
//
//   node scripts/checkMail.js                  check the credentials only
//   node scripts/checkMail.js you@example.com  also send a test message

require('dotenv').config()
const {
    isMailConfigured,
    verifyTransport,
    transportSummary,
    describeMailError,
    sendMail,
} = require('../services/mailer')

const run = async () => {
    if (!isMailConfigured()) {
        const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'].filter((key) => !process.env[key])
        console.error(`Mail is not configured. Missing in .env: ${missing.join(', ')}`)
        console.error('Sign-up still works while these are unset: the confirmation step turns itself off.')
        process.exit(1)
    }

    const settings = transportSummary()
    console.log('Using these settings:')
    console.log(`  host           ${settings.host}`)
    console.log(`  port           ${settings.port} (secure: ${settings.secure})`)
    console.log(`  user           ${settings.user}`)
    console.log(`  password       ${settings.passwordLength} characters`)
    console.log(`  from           ${settings.from}`)

    if (settings.host.includes('gmail') && settings.passwordLength !== 16) {
        console.warn('\nNote: Gmail App Passwords are exactly 16 characters. This one is not.')
    }

    try {
        await verifyTransport()
        console.log('\nCredentials accepted.')
    } catch (err) {
        console.error('\nThe mail server refused the connection:')
        console.error(`  ${describeMailError(err)}`)
        process.exit(1)
    }

    const recipient = process.argv[2]
    if (!recipient) {
        console.log('Pass an address to also send a test message: node scripts/checkMail.js you@example.com')
        return
    }

    try {
        await sendMail({
            to: recipient,
            subject: 'NexGen CRM test message',
            text: 'If you are reading this, sign-up confirmation emails will work.',
        })
        console.log(`Test message sent to ${recipient}.`)
    } catch (err) {
        console.error('\nThe message was not accepted:')
        console.error(`  ${describeMailError(err)}`)
        process.exit(1)
    }
}

run().catch((err) => {
    console.error('Mail check failed:', err)
    process.exit(1)
})
