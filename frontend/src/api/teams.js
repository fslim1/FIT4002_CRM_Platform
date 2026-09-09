import api from './client'

export const fetchTeams = () => api.get('/teams').then((r) => r.data)

export const fetchMyTeam = () => api.get('/teams/my-team').then((r) => r.data)

export const createTeam = (name) =>
    api.post('/teams', {name}).then((r) => r.data)

export const updateTeam = (teamId, payload) =>
    api.patch(`/teams/${teamId}`, payload).then((r) => r.data)

export const deleteTeam = (teamId) =>
    api.delete(`/teams/${teamId}`).then((r) => r.data)
