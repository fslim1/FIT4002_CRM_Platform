const jwt = require('jsonwebtoken')
const User = require('../models/User')

const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET
    if (!secret) {
        throw new Error('JWT_SECRET is not configured')
    }
    return secret
}

const signToken = (userId) =>
    jwt.sign({sub: userId.toString()}, getJwtSecret(), {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    })

const requireAuth = async (req, res, next) => {
    try {
        const header = req.headers.authorization || ''
        const token = header.startsWith('Bearer ') ? header.slice(7) : null

        if (!token) {
            return res.status(401).json({message: 'Authentication required'})
        }

        const decoded = jwt.verify(token, getJwtSecret())
        const user = await User.findById(decoded.sub)
        if (!user) {
            return res.status(401).json({message: 'Invalid session'})
        }

        req.user = user
        next()
    } catch (err) {
        return res.status(401).json({message: 'Invalid or expired token'})
    }
}

const requireRole = (...allowed) => (req, res, next) => {
    if (!req.user || !allowed.includes(req.user.role)) {
        return res.status(403).json({message: 'Insufficient permissions'})
    }
    next()
}

module.exports = {signToken, requireAuth, requireRole}
