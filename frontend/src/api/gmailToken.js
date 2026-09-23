export const requestGmailToken = () => {
    return new Promise((resolve, reject) => {
        if (!window.google?.accounts?.oauth2) {
            return reject(new Error('Google Identity Services SDK not loaded'))
        }

        const codeClient = window.google.accounts.oauth2.initCodeClient({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
            scope: [
                'openid',
                'email',
                'profile',
                'https://www.googleapis.com/auth/gmail.modify',
            ].join(' '),
            prompt: 'consent',
            ux_mode: 'popup',
            callback: (response) => {
                if (response.error) {
                    reject(response)
                    return
                }
                if (!response.code) {
                    reject(new Error('Google did not return an authorization code'))
                    return
                }
                resolve(response.code)
            },
        })

        codeClient.requestCode()
    })
}