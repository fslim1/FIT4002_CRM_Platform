const {OAuth2Client} = require('google-auth-library')

const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo'

const authFailed = (message = 'Google authentication failed', status = 401) => {
    const err = new Error(message)
    err.status = status
    return err
}

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

// The display name is presentation only, so a failure here costs nothing: the
// identity above is what the account is keyed on.
const displayNameFor = async (accessToken, email) => {
    try {
        const res = await fetch(USERINFO_URL, {
            headers: {Authorization: `Bearer ${accessToken}`},
        })
        if (res.ok) {
            const data = await res.json()
            if (data && typeof data.name === 'string' && data.name.trim()) {
                return data.name.trim()
            }
        }
    } catch {
        // fall through to the address
    }
    return email.split('@')[0]
}

// Establishes who an OAuth access token belongs to, for the sign-in flow that
// obtains one in the browser rather than an identity token.
//
// Google issues access tokens to a particular application, and hands the same
// user a different token for every application they use. Accepting one as
// proof of identity therefore means checking who it was issued to: a token
// minted for any other application would otherwise let its holder sign in here
// as that user. Everything the account is keyed on comes from this response,
// never from the request.
exports.verifyAccessToken = async (accessToken) => {
    if (typeof accessToken !== 'string' || !accessToken) {
        throw authFailed('Invalid token format', 400)
    }

    const oauth = getClient()

    let info
    try {
        info = await oauth.getTokenInfo(accessToken)
    } catch {
        throw authFailed()
    }

    if (!info || info.aud !== process.env.GOOGLE_CLIENT_ID) {
        throw authFailed()
    }
    if (!info.sub) {
        throw authFailed('Google did not identify the account')
    }
    if (!info.email || !info.email_verified) {
        throw authFailed('Google did not return a verified email')
    }

    const scopes = String(info.scope || '').split(' ').map((s) => s.trim()).filter(Boolean)
    const email = info.email.toLowerCase()
    return {
        googleId: info.sub,
        email,
        fullName: await displayNameFor(accessToken, email),
        gmailSendGranted: scopes.includes('https://www.googleapis.com/auth/gmail.send'),
    }
}
