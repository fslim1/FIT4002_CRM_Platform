import api from './client'

export const signup = (payload) =>
    api.post('/auth/signup', payload).then((r) => r.data)

export const login = (payload) =>
    api.post('/auth/login', payload).then((r) => r.data)

export const fetchMe = () => api.get('/auth/me').then((r) => r.data)

export const fetchAuthConfig = () =>
    api.get('/auth/config').then((r) => r.data)

export const googleLogin = (payload) => {
    const body = typeof payload === 'string' ? { credential: payload } : payload;
    return api.post('/auth/google', body).then((r) => r.data);
}
