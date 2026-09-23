const User = require('../models/User')
const {signToken} = require('../middleware/auth')
const {verifyIdToken, verifyAccessToken, exchangeGoogleCode} = require('../services/googleAuth')
const {verifyEmailExists} = require('../services/emailVerification')
const {validatePassword} = require('../services/passwordPolicy')
const {seedCompanyRiskBenchmarksIfNew} = require('../services/seedCompanyDefaults')
const {setupGmailWatch} = require('../services/gmailService')
const {
    isConfirmationRequired,
    isValidCodeFormat,
    issueCode,
    confirmCode,
} = require('../services/emailConfirmation')

const companyFromEmail = (email) => {
    const domain = (email.split('@')[1] || '').split('.')[0] || 'My Company'
    return domain.charAt(0).toUpperCase() + domain.slice(1)
}

const isValidEmail = (email) =>
    typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const normalizeEmail = (email) => String(email || '').toLowerCase().trim()

exports.signup = async (req, res) => {
    try {
        const {fullName, email, password, companyName, gmailAccessToken, gmailRefreshToken, gmailCode} = req.body || {}

        if (!fullName || !email || !password || !companyName) {
            return res
                .status(400)
                .json({message: 'Full name, email, password and company name are required'})
        }
        if (fullName.trim().length > 120) {
            return res
                .status(400)
                .json({message: 'Full name cannot be more than 120 characters'})
        }
        if (!isValidEmail(email)) {
            return res
                .status(400)
                .json({message: 'Please provide a valid email', field: 'email'})
        }
        const passwordCheck = validatePassword(password)
        if (!passwordCheck.ok) {
            return res
                .status(400)
                .json({message: passwordCheck.message, field: 'password', failed: passwordCheck.failed})
        }

        const existing = await User.findOne({email: normalizeEmail(email)})
        if (existing) {
            return res.status(409).json({
                message: existing.emailVerified
                    ? 'An account with this email already exists'
                    : 'An account with this email is waiting to be verified. Enter the code we sent you, or request a new one.',
                field: 'email',
                code: existing.emailVerified ? 'email_taken' : 'email_not_verified',
                email: existing.emailVerified ? undefined : existing.email,
            })
        }

        // A well-formed address is not necessarily a real one: confirm the
        // mailbox exists before an account is created against it.
        const emailCheck = await verifyEmailExists(email)
        if (!emailCheck.ok) {
            return res.status(400).json({message: emailCheck.message, field: 'email'})
        }

        const confirmationRequired = isConfirmationRequired()
        const resolvedAccessToken = gmailAccessToken || null
        const resolvedRefreshToken = gmailRefreshToken || null
        const googleTokens = gmailCode ? await exchangeGoogleCode(gmailCode) : null

        // Role is always 'User' on public signup — every other role is granted
        // by an Admin from user management.
        const user = await User.create({
            fullName: fullName.trim(),
            email: normalizeEmail(email),
            password,
            companyName: companyName.trim(),
            role: 'User',
            emailVerified: !confirmationRequired,
            gmailAccessToken: googleTokens?.access_token || resolvedAccessToken,
            gmailRefreshToken: googleTokens?.refresh_token || resolvedRefreshToken,
            isGmailLinked: Boolean(googleTokens?.access_token || resolvedAccessToken || googleTokens?.refresh_token || resolvedRefreshToken),
        })

        if (user.gmailRefreshToken && !user.lastHistoryId) {
            try {
                await setupGmailWatch(user._id)
            } catch (watchError) {
                console.warn('Gmail watch setup after signup failed:', watchError.message)
            }
        }

        // H6 AC2: default benchmarks exist the moment a new company appears,
        // so scoring never starts from an empty configuration.
        await seedCompanyRiskBenchmarksIfNew(user.companyName)

        // Without a confirmation step the account is usable straight away.
        if (!confirmationRequired) {
            const token = signToken(user._id)
            return res.status(201).json({token, user: user.toSafeJSON()})
        }

        const sent = await issueCode(user)
        if (!sent.ok) {
            // The account exists but no code went out; let them ask again
            // from the verification screen rather than start over.
            return res.status(201).json({
                verificationRequired: true,
                email: user.email,
                codeSent: false,
                message: sent.message,
            })
        }

        return res.status(201).json({
            verificationRequired: true,
            email: user.email,
            codeSent: true,
            expiresInMinutes: sent.expiresInMinutes,
        })
    } catch (err) {
        if (err && err.name === 'ValidationError') {
            const message = Object.values(err.errors).map((e) => e.message).join(', ')
            return res.status(400).json({message})
        }
        console.error('Signup error:', err)
        return res.status(500).json({message: 'Unable to create account'})
    }
}

exports.login = async (req, res) => {
    try {
        const {email, password} = req.body || {}
        if (!email || !password) {
            return res.status(400).json({message: 'Email and password are required'})
        }

        const user = await User.findOne({email: normalizeEmail(email)}).select('+password')
        if (!user) {
            return res.status(401).json({message: 'Invalid email or password'})
        }

        const ok = await user.comparePassword(password)
        if (!ok) {
            return res.status(401).json({message: 'Invalid email or password'})
        }

        // The checks below name a specific reason for the refusal, so they run
        // only once the password is right. Before that, every failure has to
        // look alike, or the response tells a stranger which addresses have
        // accounts and which of those are closed.
        if (user.isActive === false) {
            return res
                .status(401)
                .json({message: 'This account has been deactivated. Please contact your administrator.'})
        }

        if (!user.emailVerified) {
            return res.status(403).json({
                message: 'Please confirm your email address before logging in.',
                code: 'email_not_verified',
                email: user.email,
            })
        }

        const token = signToken(user._id)
        return res.json({token, user: user.toSafeJSON()})
    } catch (err) {
        console.error('Login error:', err)
        return res.status(500).json({message: 'Unable to log in'})
    }
}

// POST /api/auth/verify-email: finish a sign-up with the emailed code.
exports.verifyEmail = async (req, res) => {
    try {
        const {email, code} = req.body || {}

        if (!email || !code) {
            return res.status(400).json({message: 'Email and verification code are required'})
        }
        if (!isValidCodeFormat(code)) {
            return res
                .status(400)
                .json({message: 'Enter the 6-digit code from your email.', field: 'code'})
        }

        const user = await User.findOne({email: normalizeEmail(email)})
        if (!user) {
            return res
                .status(400)
                .json({message: 'That code is not correct.', field: 'code'})
        }
        if (user.emailVerified) {
            return res.status(409).json({
                message: 'This email is already confirmed. Please log in.',
                code: 'already_verified',
            })
        }

        const result = await confirmCode(user, code)
        if (!result.ok) {
            return res.status(400).json({message: result.message, field: 'code', code: result.reason})
        }

        await user.populate('team', 'name')
        const token = signToken(user._id)
        return res.json({token, user: user.toSafeJSON()})
    } catch (err) {
        console.error('Verify email error:', err)
        return res.status(500).json({message: 'Unable to confirm your email address'})
    }
}

// POST /api/auth/resend-verification: send a fresh code for a pending sign-up.
exports.resendVerification = async (req, res) => {
    try {
        const {email} = req.body || {}
        if (!email) {
            return res.status(400).json({message: 'Email is required'})
        }

        const user = await User.findOne({email: normalizeEmail(email)})

        // Unknown or already-confirmed addresses get the same answer as a
        // successful send, so the endpoint cannot be used to find accounts.
        const generic = {
            message: 'If that account still needs confirming, a new code is on its way.',
        }
        if (!user || user.emailVerified) return res.json(generic)

        const sent = await issueCode(user)
        if (!sent.ok) {
            const status = sent.reason === 'cooldown' ? 429 : 502
            return res
                .status(status)
                .json({message: sent.message, retryAfterSeconds: sent.retryAfterSeconds})
        }

        return res.json({...generic, codeSent: true, expiresInMinutes: sent.expiresInMinutes})
    } catch (err) {
        console.error('Resend verification error:', err)
        return res.status(500).json({message: 'Unable to send a new verification code'})
    }
}

exports.me = async (req, res) => {
    return res.json({user: req.user.toSafeJSON()})
}

exports.googleLogin = async (req, res) => {
    try {
        const {credential, gmailAccessToken, gmailRefreshToken, code} = req.body || {}

        let googleTokens = null
        let profile
        try {
            if (typeof credential === 'string' && credential) {
                profile = await verifyIdToken(credential)
            } else if (typeof code === 'string' && code) {
                googleTokens = await exchangeGoogleCode(code)
                profile = await verifyAccessToken(googleTokens.access_token)
            } else if (typeof gmailAccessToken === 'string' && gmailAccessToken) {
                profile = await verifyAccessToken(gmailAccessToken)
            } else {
                return res
                    .status(400)
                    .json({message: 'Missing Google authentication payload'})
            }
        } catch (err) {
            const status = err.status || 401
            return res
                .status(status)
                .json({message: err.message || 'Google authentication failed'})
        }

        let user = await User.findOne({
            $or: [{googleId: profile.googleId}, {email: profile.email}],
        })

        const hasGmailSendScope = Boolean(profile.gmailSendGranted)

        const resolvedAccessToken = googleTokens?.access_token || gmailAccessToken || null
        const resolvedRefreshToken = googleTokens?.refresh_token || gmailRefreshToken || null

        if (user) {
            // Reject deactivated accounts.
            if (user.isActive === false) {
                return res
                    .status(401)
                    .json({message: 'This account has been deactivated. Please contact your administrator.'})
            }
            if (!user.googleId) user.googleId = profile.googleId
            // Google has already proven the address belongs to this person.
            if (!user.emailVerified) user.emailVerified = true

            if (hasGmailSendScope) {
                if (resolvedAccessToken) {
                    user.gmailAccessToken = resolvedAccessToken
                }
                if (resolvedRefreshToken) {
                    user.gmailRefreshToken = resolvedRefreshToken
                }
                user.isGmailLinked = Boolean(user.gmailAccessToken || user.gmailRefreshToken)
            } else {
                user.isGmailLinked = Boolean(user.gmailAccessToken || user.gmailRefreshToken)
            }

            await user.save()
        } else {
            const companyName = companyFromEmail(profile.email)
            user = await User.create({
                fullName: profile.fullName,
                email: profile.email,
                companyName,
                role: 'User',
                emailVerified: true,
                authProvider: 'google',
                googleId: profile.googleId,
                gmailAccessToken: hasGmailSendScope ? resolvedAccessToken : null,
                gmailRefreshToken: hasGmailSendScope ? resolvedRefreshToken : null,
                isGmailLinked: hasGmailSendScope && Boolean(resolvedAccessToken || resolvedRefreshToken),
            })

            // H6 AC2: same default-seeding on Google's new-company path.
            await seedCompanyRiskBenchmarksIfNew(companyName)
        }

        if (user.gmailRefreshToken && !user.lastHistoryId) {
            try {
                await setupGmailWatch(user._id)
            } catch (watchError) {
                console.warn('Gmail watch setup after Google login failed:', watchError.message)
            }
        }

        const token = signToken(user._id)
        return res.json({token, user: user.toSafeJSON()})
    } catch (err) {
        console.error('Google login error:', err)
        return res.status(500).json({message: 'Unable to complete Google login'})
    }
}