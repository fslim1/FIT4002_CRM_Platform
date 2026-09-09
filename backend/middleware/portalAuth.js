const jwt = require('jsonwebtoken')
const CustomerAccount = require('../models/CustomerAccount')

// Auth for the customer self-service portal. Portal tokens carry a
// dedicated `kind` claim and resolve against the CustomerAccount collection,
// so they can never be used on staff endpoints.

const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET
    if (!secret) {
        throw new Error('JWT_SECRET is not configured')
    }
    return secret
}

const signPortalToken = (accountId) =>
    jwt.sign({sub: accountId.toString(), kind: 'portal'}, getJwtSecret(), {
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    })

const requirePortalAuth = async (req, res, next) => {
    try {
        const header = req.headers.authorization || ''
        const token = header.startsWith('Bearer ') ? header.slice(7) : null

        if (!token) {
            return res.status(401).json({message: 'Authentication required'})
        }

        const decoded = jwt.verify(token, getJwtSecret())
        if (decoded.kind !== 'portal') {
            return res.status(401).json({message: 'Invalid session'})
        }

        const account = await CustomerAccount.findById(decoded.sub).populate('customer')
        if (!account || !account.customer) {
            return res.status(401).json({message: 'Invalid session'})
        }

        req.portalAccount = account
        req.customer = account.customer
        next()
    } catch (err) {
        return res.status(401).json({message: 'Invalid or expired token'})
    }
}

module.exports = {signPortalToken, requirePortalAuth}
