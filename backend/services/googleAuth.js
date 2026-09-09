const {OAuth2Client} = require('google-auth-library')

let client

const getClient = () => {
    const clientId = process.env.GOOGLE_CLIENT_ID
    if (!clientId) {
        const err = new Error('Google OAuth is not configured on the server')
        err.status = 503
        throw err
    }
    if (!client) client = new OAuth2Client(clientId)
    return client
}

exports.verifyIdToken = async (idToken) => {
    if (typeof idToken !== 'string') {
        const err = new Error('Invalid token format');
        err.status = 400;
        throw err;
    }
    
    const oauth = getClient()
    const ticket = await oauth.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload || !payload.email || !payload.email_verified) {
        const err = new Error('Google did not return a verified email')
        err.status = 401
        throw err
    }
    return {
        googleId: payload.sub,
        email: payload.email.toLowerCase(),
        fullName: payload.name || payload.email.split('@')[0],
    }
}
