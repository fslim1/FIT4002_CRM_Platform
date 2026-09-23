const GOOGLE_USERINFO_SCOPES =
    'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'
const GOOGLE_GMAIL_SCOPES =
    'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile'

export const requestGoogleSignInToken = ({forceConsent = false} = {}) => {
    return new Promise((resolve, reject) => {
        if (!window.google?.accounts?.oauth2) {
            return reject(new Error('Google Identity Services SDK not loaded'))
        }

        const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
            scope: GOOGLE_USERINFO_SCOPES,
            prompt: forceConsent ? 'consent' : '',
            include_granted_scopes: true,
            callback: (response) => {
                if (response.error) {
                    reject(response)
                } else {
                    resolve(response.access_token)
                }
            },
        })

        tokenClient.requestAccessToken()
    })
}

export const requestGmailToken = ({forceConsent = false} = {}) => {
    return new Promise((resolve, reject) => {
        if (!window.google?.accounts?.oauth2) {
            return reject(new Error('Google Identity Services SDK not loaded'))
        }

        const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
            scope: GOOGLE_GMAIL_SCOPES,
            prompt: forceConsent ? 'consent' : '',
            include_granted_scopes: true,
            callback: (response) => {
                if (response.error) {
                    reject(response)
                } else {
                    resolve(response.access_token)
                }
            },
        })

        tokenClient.requestAccessToken()
    })
}