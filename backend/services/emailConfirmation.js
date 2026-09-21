const crypto = require('crypto')
const {isMailConfigured, sendMail, describeMailError} = require('./mailer')

// Sign-up confirmation: a short numeric code is emailed to the address, and
// the account only becomes usable once that code comes back. This is what
// proves the mailbox exists and belongs to the person signing up, beyond the
// format and deliverability checks in services/emailVerification.js.
//
// Codes are stored hashed, expire after fifteen minutes, allow a handful of
// attempts, and cannot be re-sent more than once a minute.

const CODE_LENGTH = 6
const CODE_TTL_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 60 * 1000

const CODE_TTL_MINUTES = Math.round(CODE_TTL_MS / 60000)

// "auto" turns the step on as soon as a mail transport is configured, so a
// checkout without SMTP credentials still has a working sign-up.
const isConfirmationRequired = () => {
    const mode = (process.env.SIGNUP_EMAIL_CONFIRMATION || 'auto').toLowerCase()
    if (mode === 'on') return true
    if (mode === 'off') return false
    return isMailConfigured()
}

const generateCode = () =>
    String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0')

const hashCode = (code) =>
    crypto
        .createHmac('sha256', process.env.JWT_SECRET || 'email-confirmation')
        .update(String(code))
        .digest('hex')

const hashesMatch = (a, b) => {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

const isValidCodeFormat = (code) =>
    typeof code === 'string' && new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code.trim())

const buildMessage = (user, code) => {
    const name = (user.fullName || '').split(' ')[0] || 'there'
    return {
        subject: `${code} is your NexGen CRM verification code`,
        text:
            `Hi ${name},\n\n` +
            `Your NexGen CRM verification code is ${code}.\n` +
            `It expires in ${CODE_TTL_MINUTES} minutes.\n\n` +
            'If you did not create this account you can ignore this email.\n',
        html:
            `<p>Hi ${name},</p>` +
            '<p>Use this code to finish setting up your NexGen CRM account:</p>' +
            `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:16px 0">${code}</p>` +
            `<p>The code expires in ${CODE_TTL_MINUTES} minutes.</p>` +
            '<p style="color:#555555">If you did not create this account you can ignore this email.</p>',
    }
}

// Issues a fresh code and emails it. The cooldown is reported back rather than
// thrown so callers can tell the person how long to wait.
const issueCode = async (user) => {
    const now = Date.now()
    const lastSent = user.emailVerification?.sentAt
        ? new Date(user.emailVerification.sentAt).getTime()
        : 0
    const waited = now - lastSent

    if (lastSent && waited < RESEND_COOLDOWN_MS) {
        return {
            ok: false,
            reason: 'cooldown',
            retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - waited) / 1000),
            message: 'A code was just sent. Please wait a moment before asking for another.',
        }
    }

    const code = generateCode()
    user.emailVerification = {
        codeHash: hashCode(code),
        expiresAt: new Date(now + CODE_TTL_MS),
        attempts: 0,
        sentAt: new Date(now),
    }
    await user.save()

    try {
        await sendMail({to: user.email, ...buildMessage(user, code)})
    } catch (err) {
        console.error('Verification email error:', describeMailError(err))
        console.error(err)
        // Clear the cooldown so the person can immediately try again.
        user.emailVerification.sentAt = null
        await user.save()
        return {
            ok: false,
            reason: 'send_failed',
            message: 'We could not send the verification email. Please try again in a moment.',
        }
    }

    return {ok: true, expiresInMinutes: CODE_TTL_MINUTES}
}

const confirmCode = async (user, code) => {
    const state = user.emailVerification

    if (!state || !state.codeHash) {
        return {ok: false, reason: 'no_code', message: 'Request a verification code to continue.'}
    }
    if (!state.expiresAt || new Date(state.expiresAt).getTime() <= Date.now()) {
        return {ok: false, reason: 'expired', message: 'That code has expired. Please request a new one.'}
    }
    if ((state.attempts || 0) >= MAX_ATTEMPTS) {
        return {
            ok: false,
            reason: 'too_many_attempts',
            message: 'Too many incorrect codes. Please request a new one.',
        }
    }
    if (!hashesMatch(hashCode(String(code).trim()), state.codeHash)) {
        state.attempts = (state.attempts || 0) + 1
        await user.save()
        const left = MAX_ATTEMPTS - state.attempts
        return {
            ok: false,
            reason: 'mismatch',
            attemptsLeft: left,
            message: left > 0
                ? `That code is not correct. ${left} attempt${left === 1 ? '' : 's'} left.`
                : 'Too many incorrect codes. Please request a new one.',
        }
    }

    user.emailVerified = true
    user.emailVerification = {codeHash: null, expiresAt: null, attempts: 0, sentAt: null}
    await user.save()
    return {ok: true}
}

module.exports = {
    CODE_LENGTH,
    CODE_TTL_MINUTES,
    isConfirmationRequired,
    isValidCodeFormat,
    issueCode,
    confirmCode,
}
