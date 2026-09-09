import {useEffect, useMemo, useState, useCallback} from 'react'
import * as authApi from '@/api/auth'
import {AuthContext} from '@/context/auth'

const TOKEN_KEY = 'nexgen_token'
const USER_KEY = 'nexgen_user'

const readStoredUser = () => {
    const raw = localStorage.getItem(USER_KEY)
    try {
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

export const requestGmailToken = () => {
    return new Promise((resolve, reject) => {
        if (!window.google?.accounts?.oauth2) {
            return reject(new Error('Google Identity Services SDK not loaded'))
        }

        const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
            scope:
                'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
            prompt: '',
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

export function AuthProvider({children}) {
    const [user, setUser] = useState(readStoredUser)
    const [initializing, setInitializing] = useState(() =>
        Boolean(localStorage.getItem(TOKEN_KEY))
    )

    useEffect(() => {
        const token = localStorage.getItem(TOKEN_KEY)
        if (!token) return

        let cancelled = false
        authApi
            .fetchMe()
            .then(({user}) => {
                if (cancelled) return
                setUser(user)
                localStorage.setItem(USER_KEY, JSON.stringify(user))
            })
            .catch(() => {
                if (cancelled) return
                localStorage.removeItem(TOKEN_KEY)
                localStorage.removeItem(USER_KEY)
                setUser(null)
            })
            .finally(() => {
                if (!cancelled) setInitializing(false)
            })

        return () => {
            cancelled = true
        }
    }, [])

    useEffect(() => {
        const handleExpired = () => setUser(null)
        window.addEventListener('auth:session-expired', handleExpired)
        return () =>
            window.removeEventListener('auth:session-expired', handleExpired)
    }, [])

    const persist = (token, nextUser) => {
        localStorage.setItem(TOKEN_KEY, token)
        localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
        setUser(nextUser)
    }

    const login = useCallback(async (email, password) => {
        const {token, user: u} = await authApi.login({email, password})
        persist(token, u)
        return u
    }, [])

    const signup = useCallback(async (payload) => {
        const {token, user: u} = await authApi.signup(payload)
        persist(token, u)
        return u
    }, [])

    const loginWithGoogle = useCallback(async (credential) => {
        const {token, user: u} = await authApi.googleLogin(credential)
        persist(token, u)
        return u
    }, [])

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        setUser(null)
    }, [])

    const value = useMemo(
        () => ({user, initializing, login, signup, loginWithGoogle, logout, requestGmailToken}),
        [user, initializing, login, signup, loginWithGoogle, logout]
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
