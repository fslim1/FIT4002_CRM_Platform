const express = require('express')
const rateLimit = require('express-rate-limit')
const {
    signup,
    login,
    me,
    googleLogin,
} = require('../controllers/authController')
const {requireAuth} = require('../middleware/auth')

const router = express.Router()

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: {message: 'Too many attempts in a short period. Please try again later.'},
})

router.post('/signup', authLimiter, signup)
router.post('/login', authLimiter, login)
router.post('/google', authLimiter, googleLogin)
router.get('/me', requireAuth, me)
router.get('/config', (req, res) => {
    res.json({
        googleClientId: process.env.GOOGLE_CLIENT_ID || null,
    })
})

module.exports = router
