import api from './client'

export const fetchSettings = () => api.get('/settings').then((r) => r.data)

export const updateSettings = (payload) =>
    api.put('/settings', payload).then((r) => r.data)
