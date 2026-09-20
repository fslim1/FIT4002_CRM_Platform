const nodemailer = require('nodemailer')

// Outbound mail for messages the CRM sends on its own behalf, such as sign-up
// verification codes. This is separate from services/gmailService.js, which
// sends customer mail as the logged-in salesperson through their own account.
//
// Credentials come from the environment; with none set the transport reports
// itself as unconfigured so callers can fall back rather than fail.

const isMailConfigured = () =>
    Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)

// Google shows an App Password as four groups of four letters. People paste it
// with the spaces, which the SMTP server rejects, so that exact shape is
// closed up. Any other password is passed through untouched.
const APP_PASSWORD_WITH_SPACES = /^([a-z]{4}\s+){3}[a-z]{4}$/i

const readSecret = (value) => {
    const trimmed = String(value || '').trim()
    return APP_PASSWORD_WITH_SPACES.test(trimmed) ? trimmed.replace(/\s+/g, '') : trimmed
}

let transporter = null

const getTransporter = () => {
    if (transporter) return transporter

    const port = Number(process.env.SMTP_PORT) || 587
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        // Implicit TLS on 465; STARTTLS is negotiated on every other port.
        secure: process.env.SMTP_SECURE
            ? process.env.SMTP_SECURE === 'true'
            : port === 465,
        auth: {
            user: String(process.env.SMTP_USER || '').trim(),
            pass: readSecret(process.env.SMTP_PASS),
        },
    })
    return transporter
}

// What the transport will actually use, for the diagnostics script. The
// password is never included, only its length.
const transportSummary = () => ({
    host: process.env.SMTP_HOST || null,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : Number(process.env.SMTP_PORT) === 465,
    user: String(process.env.SMTP_USER || '').trim() || null,
    passwordLength: readSecret(process.env.SMTP_PASS).length,
    from: senderAddress(),
})

// Turns a nodemailer failure into something a developer can act on.
const describeMailError = (err) => {
    if (!err) return 'Unknown mail error'
    const code = err.code || ''
    const status = err.responseCode

    if (code === 'EAUTH' || status === 535) {
        return (
            'SMTP rejected the username and password. For Gmail, SMTP_USER must be the full address and ' +
            'SMTP_PASS must be a 16-character App Password (Google Account -> Security -> 2-Step Verification ' +
            '-> App passwords), not the account password. Run "node scripts/checkMail.js" to retest.'
        )
    }
    if (code === 'EENVELOPE' || status === 553 || status === 550) {
        return (
            'The mail server refused the sender or recipient. Gmail requires MAIL_FROM to be the same address ' +
            'as SMTP_USER, or one of its verified aliases.'
        )
    }
    if (['ECONNECTION', 'ESOCKET', 'ETIMEDOUT', 'EDNS', 'ECONNREFUSED'].includes(code)) {
        return `Could not reach ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}. Check the host and port, and that the network allows outbound SMTP.`
    }
    return err.message || String(err)
}

// Confirms the credentials without sending anything.
const verifyTransport = async () => {
    if (!isMailConfigured()) throw new Error('Mail transport is not configured')
    return getTransporter().verify()
}

const senderAddress = () =>
    process.env.MAIL_FROM || `NexGen CRM <${process.env.SMTP_USER}>`

const sendMail = async ({to, subject, text, html}) => {
    if (!isMailConfigured()) {
        throw new Error('Mail transport is not configured')
    }
    return getTransporter().sendMail({from: senderAddress(), to, subject, text, html})
}

module.exports = {isMailConfigured, sendMail, verifyTransport, transportSummary, describeMailError}
