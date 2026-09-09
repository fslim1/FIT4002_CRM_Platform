import axios from 'axios'

const baseURL = import.meta.env.VITE_API_URL || '/api'
const AUTH_ENDPOINTS = ['/auth/login', '/auth/signup', '/auth/google']

const api = axios.create({baseURL})

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('nexgen_token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

api.interceptors.response.use(
    (res) => res,
    (err) => {
        const status = err.response?.status
        const url = err.config?.url || ''
        const isAuthAttempt = AUTH_ENDPOINTS.some((path) => url.includes(path))

        if (status === 401 && !isAuthAttempt) {
            localStorage.removeItem('nexgen_token')
            localStorage.removeItem('nexgen_user')
            window.dispatchEvent(new Event('auth:session-expired'))
        }
        return Promise.reject(err)
    }
)

export default api
