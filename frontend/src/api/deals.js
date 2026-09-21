import api from './client'

export const getDeals = (params = {}) => api.get('/deals', {params}).then(r => r.data)
export const createDeal = (payload) => api.post('/deals', payload).then(r => r.data)
export const updateDealStage = (dealId, stage) => api.patch(`/deals/${dealId}/stage`, { stage }).then(r => r.data)
export const markDealOutcome = (dealId, outcome) => api.patch(`/deals/${dealId}/outcome`, { outcome }).then(r => r.data)
export const getDealLogs = () => api.get('/deals/logs').then(r => r.data)
export const deleteDeal = (dealId) => api.delete(`/deals/${dealId}`).then(r => r.data)
export const updateDealProbability = (dealId, probability) => api.patch(`/deals/${dealId}/probability`, {probability}).then(r => r.data)