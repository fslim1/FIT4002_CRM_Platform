import {useEffect, useMemo, useState, useCallback} from 'react'
import * as authApi from '@/api/auth'
import {AuthContext} from '@/context/auth'
import {requestGmailToken} from '@/api/gmailToken'

const TOKEN_KEY = 'nexgen_token'
const USER_KEY = 'nexgen_user'
const GOOGLE_TOKEN_KEY = 'google_access_token'

const readStoredUser = () => {
    const raw = localStorage.getItem(USER_KEY)
    try {
        return raw ? JSON.parse(raw) : null
    } catch {
        return null
    }
}

const persistGoogleAccessToken = (token) => {
    if (token) {
        localStorage.setItem(GOOGLE_TOKEN_KEY, token)
    } else {
        localStorage.removeItem(GOOGLE_TOKEN_KEY)
    }
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

    // Sign-up either returns a session or asks for the emailed confirmation
    // code, so the raw response is handed back for the page to act on.
    const signup = useCallback(async (payload) => {
        const data = await authApi.signup(payload)
        if (data.token && data.user) {
            persist(data.token, data.user)
            persistGoogleAccessToken(data.user.gmailAccessToken || payload.gmailAccessToken)
        }
        return data
    }, [])

    const verifyEmail = useCallback(async ({email, code}) => {
        const {token, user: u} = await authApi.verifyEmail({email, code})
        persist(token, u)
        return u
    }, [])

    const loginWithGoogle = useCallback(async (credential) => {
        const {token, user: u} = await authApi.googleLogin(credential)
        persist(token, u)
        persistGoogleAccessToken(u?.gmailAccessToken || credential?.gmailAccessToken)
        return u
    }, [])

    const logout = useCallback(() => {
        localStorage.removeItem(TOKEN_KEY)
        localStorage.removeItem(USER_KEY)
        setUser(null)
    }, [])

    const value = useMemo(
        () => ({
            user,
            initializing,
            login,
            signup,
            verifyEmail,
            loginWithGoogle,
            logout,
            requestGmailToken,
        }),
        [user, initializing, login, signup, verifyEmail, loginWithGoogle, logout]
    )

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
