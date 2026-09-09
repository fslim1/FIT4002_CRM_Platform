const User = require('../models/User')
const {ROLES} = require('../models/User')
const {signToken} = require('../middleware/auth')
const {verifyIdToken} = require('../services/googleAuth')

const companyFromEmail = (email) => {
    const domain = (email.split('@')[1] || '').split('.')[0] || 'My Company'
    return domain.charAt(0).toUpperCase() + domain.slice(1)
}

const isValidEmail = (email) =>
    typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

exports.signup = async (req, res) => {
    try {
        const {fullName, email, password, companyName, role, gmailAccessToken} = req.body || {}

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
            return res.status(400).json({message: 'Please provide a valid email'})
        }
        if (typeof password !== 'string' || password.length < 8) {
            return res
                .status(400)
                .json({message: 'Password must be at least 8 characters'})
        }
        if (role && !ROLES.includes(role)) {
            return res.status(400).json({message: 'Invalid role'})
        }

        const existing = await User.findOne({email: email.toLowerCase()})
        if (existing) {
            return res
                .status(409)
                .json({message: 'An account with this email already exists'})
        }

        const user = await User.create({
            fullName: fullName.trim(),
            email: email.toLowerCase().trim(),
            password,
            companyName: companyName.trim(),
            role: role || 'User',
            gmailAccessToken: gmailAccessToken || null,
            isGmailLinked: Boolean(gmailAccessToken),
        })

        const token = signToken(user._id)
        return res.status(201).json({token, user: user.toSafeJSON()})
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

        const user = await User.findOne({email: email.toLowerCase()}).select('+password')
        if (!user) {
            return res.status(401).json({message: 'Invalid email or password'})
        }

        const ok = await user.comparePassword(password)
        if (!ok) {
            return res.status(401).json({message: 'Invalid email or password'})
        }

        const token = signToken(user._id)
        return res.json({token, user: user.toSafeJSON()})
    } catch (err) {
        console.error('Login error:', err)
        return res.status(500).json({message: 'Unable to log in'})
    }
}

exports.me = async (req, res) => {
    return res.json({user: req.user.toSafeJSON()})
}

exports.googleLogin = async (req, res) => {
    try {
        const {credential, email, fullName, googleId, gmailAccessToken} = req.body || {}

        let profile = {}

        if (email && googleId) {
            profile = {
                googleId,
                email: email.toLowerCase(),
                fullName: fullName || email.split('@')[0],
            }
        } else if (typeof credential === 'string') {
            try {
                profile = await verifyIdToken(credential)
            } catch (err) {
                const status = err.status || 401
                return res
                    .status(status)
                    .json({message: err.message || 'Google authentication failed'})
            }
        } else {
            return res
            .status(400)
            .json({message: 'Missing Google authentication payload'})
        }

        let user = await User.findOne({
            $or: [{googleId: profile.googleId}, {email: profile.email}],
        })

        if (user) {
            if (!user.googleId) user.googleId = profile.googleId
            if (gmailAccessToken) {
                user.gmailAccessToken = gmailAccessToken
                user.isGmailLinked = true
            }
            await user.save()
        } else {
            user = await User.create({
                fullName: profile.fullName,
                email: profile.email,
                companyName: companyFromEmail(profile.email),
                role: 'User',
                authProvider: 'google',
                googleId: profile.googleId,
                gmailAccessToken: gmailAccessToken || null,
                isGmailLinked: Boolean(gmailAccessToken),
            })
        }

        const token = signToken(user._id)
        return res.json({token, user: user.toSafeJSON()})
    } catch (err) {
        console.error('Google login error:', err)
        return res.status(500).json({message: 'Unable to complete Google login'})
    }    
}
