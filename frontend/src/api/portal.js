import axios from 'axios'

// Dedicated client for the customer self-service portal. Portal
// sessions are stored under their own keys so they never mix with staff auth.
export const PORTAL_TOKEN_KEY = 'nexgen_portal_token'
export const PORTAL_PROFILE_KEY = 'nexgen_portal_profile'

const baseURL = import.meta.env.VITE_API_URL || '/api'

const portalApi = axios.create({baseURL})

portalApi.interceptors.request.use((config) => {
    const token = localStorage.getItem(PORTAL_TOKEN_KEY)
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

portalApi.interceptors.response.use(
    (res) => res,
    (err) => {
        const status = err.response?.status
        const url = err.config?.url || ''
        const isAuthAttempt =
            url.includes('/portal/login') || url.includes('/portal/register')

        if (status === 401 && !isAuthAttempt) {
            clearPortalSession()
            window.dispatchEvent(new Event('portal:session-expired'))
        }
        return Promise.reject(err)
    }
)

export const clearPortalSession = () => {
    localStorage.removeItem(PORTAL_TOKEN_KEY)
    localStorage.removeItem(PORTAL_PROFILE_KEY)
}

export const storePortalSession = (token, profile) => {
    localStorage.setItem(PORTAL_TOKEN_KEY, token)
    localStorage.setItem(PORTAL_PROFILE_KEY, JSON.stringify(profile))
}

export const hasPortalSession = () =>
    Boolean(localStorage.getItem(PORTAL_TOKEN_KEY))

export const portalRegister = (payload) =>
    portalApi.post('/portal/register', payload).then((r) => r.data)

export const portalLogin = (payload) =>
    portalApi.post('/portal/login', payload).then((r) => r.data)

export const fetchPortalProfile = () =>
    portalApi.get('/portal/me').then((r) => r.data)

export const updatePortalProfile = (payload) =>
    portalApi.put('/portal/profile', payload).then((r) => r.data)

export const fetchPortalDeals = () =>
    portalApi.get('/portal/deals').then((r) => r.data)
