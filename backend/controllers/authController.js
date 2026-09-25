const User = require('../models/User')
const Company = require('../models/Company')
const {signToken} = require('../middleware/auth')
const {verifyIdToken, verifyAccessToken} = require('../services/googleAuth')
const {verifyEmailExists} = require('../services/emailVerification')
const {validatePassword} = require('../services/passwordPolicy')
const {seedCompanyRiskBenchmarksIfNew} = require('../services/seedCompanyDefaults')
const {
    isConfirmationRequired,
    isValidCodeFormat,
    issueCode,
    confirmCode,
} = require('../services/emailConfirmation')

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const companyFromEmail = (email) => {
    const domain = (email.split('@')[1] || '').split('.')[0] || 'My Company'
    return domain.charAt(0).toUpperCase() + domain.slice(1)
}

const isValidEmail = (email) =>
    typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

const normalizeEmail = (email) => String(email || '').toLowerCase().trim()

const ensureUserCompany = async (user) => {
    if (!user || user.companyId) return user
    const cName = (user.companyName || 'My Company').trim()
    let company = await Company.findOne({
        name: new RegExp(`^${escapeRegex(cName)}$`, 'i'),
    })
    if (!company) {
        company = await Company.create({name: cName})
    }
    user.companyId = company._id
    user.companyName = company.name
    await user.save()
    return user
}

exports.signup = async (req, res) => {
    try {
        const {fullName, email, password, companyName, gmailAccessToken} = req.body || {}

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

        const trimmedCompanyName = companyName.trim()
        let company = await Company.findOne({
            name: new RegExp(`^${escapeRegex(trimmedCompanyName)}$`, 'i'),
        })
        if (company) {
            return res.status(409).json({
                message: 'A company with this name already exists. If your company is already registered, please contact your administrator for an account invitation.',
                field: 'companyName',
            })
        }

        try {
            company = await Company.create({name: trimmedCompanyName})
        } catch (compErr) {
            if (compErr && compErr.code === 11000) {
                return res.status(409).json({
                    message: 'A company with this name already exists.',
                    field: 'companyName',
                })
            }
            throw compErr
        }

        const confirmationRequired = isConfirmationRequired()

        // Creating a NEW company automatically assigns role = 'admin'
        // and companyId = newlyCreatedCompany._id.
        const user = await User.create({
            fullName: fullName.trim(),
            email: normalizeEmail(email),
            password,
            companyId: company._id,
            companyName: company.name,
            role: 'Admin',
            emailVerified: !confirmationRequired,
            gmailAccessToken: gmailAccessToken || null,
            isGmailLinked: Boolean(gmailAccessToken),
        })

        // H6 AC2: default benchmarks exist the moment a new company appears
        await seedCompanyRiskBenchmarksIfNew(user.companyName)

        // Without a confirmation step the account is usable straight away.
        if (!confirmationRequired) {
            const token = signToken(user._id)
            return res.status(201).json({token, user: user.toSafeJSON()})
        }

        const sent = await issueCode(user)
        if (!sent.ok) {
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

        let user = await User.findOne({email: normalizeEmail(email)}).select('+password')
        if (!user) {
            return res.status(401).json({message: 'Invalid email or password'})
        }

        const ok = await user.comparePassword(password)
        if (!ok) {
            return res.status(401).json({message: 'Invalid email or password'})
        }

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

        user = await ensureUserCompany(user)

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

        let user = await User.findOne({email: normalizeEmail(email)})
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

        user = await ensureUserCompany(user)
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
    let user = req.user
    if (!user.companyId) {
        user = await ensureUserCompany(user)
    }
    return res.json({user: user.toSafeJSON()})
}

exports.googleLogin = async (req, res) => {
    try {
        const {credential, gmailAccessToken} = req.body || {}

        let profile
        try {
            if (typeof credential === 'string' && credential) {
                profile = await verifyIdToken(credential)
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

        if (user) {
            if (user.isActive === false) {
                return res
                    .status(401)
                    .json({message: 'This account has been deactivated. Please contact your administrator.'})
            }
            if (!user.googleId) user.googleId = profile.googleId
            if (!user.emailVerified) user.emailVerified = true
            if (hasGmailSendScope && gmailAccessToken) {
                user.gmailAccessToken = gmailAccessToken
                user.isGmailLinked = true
            } else if (!hasGmailSendScope && user.gmailAccessToken) {
                user.isGmailLinked = true
            }
            user = await ensureUserCompany(user)
            await user.save()
        } else {
            const cName = companyFromEmail(profile.email)
            let company = await Company.findOne({
                name: new RegExp(`^${escapeRegex(cName)}$`, 'i'),
            })
            let isNewCompany = false
            if (!company) {
                company = await Company.create({name: cName})
                isNewCompany = true
            }

            user = await User.create({
                fullName: profile.fullName,
                email: profile.email,
                companyId: company._id,
                companyName: company.name,
                role: isNewCompany ? 'Admin' : 'User',
                emailVerified: true,
                authProvider: 'google',
                googleId: profile.googleId,
                gmailAccessToken: hasGmailSendScope ? (gmailAccessToken || null) : null,
                isGmailLinked: hasGmailSendScope && Boolean(gmailAccessToken),
            })

            await seedCompanyRiskBenchmarksIfNew(company.name)
        }

        const token = signToken(user._id)
        return res.json({token, user: user.toSafeJSON()})
    } catch (err) {
        console.error('Google login error:', err)
        return res.status(500).json({message: 'Unable to complete Google login'})
    }
}