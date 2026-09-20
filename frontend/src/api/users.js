import api from './client'

export const fetchUsers = (params = {}) =>
    api.get('/users', {params}).then((r) => r.data)

export const updateUserRole = (userId, role) =>
    api.patch(`/users/${userId}/role`, {role}).then((r) => r.data)

export const updateUserTeam = (userId, teamId) =>
    api.patch(`/users/${userId}/team`, {teamId}).then((r) => r.data)

export const updateUserPermissions = (userId, permissions) =>
    api.patch(`/users/${userId}/permissions`, {permissions}).then((r) => r.data)

// People the current user can assign work to, used by the task assignee
// pickers. Returns a plain array of {_id, fullName, email, role}.
export const getUsers = () =>
    api.get('/users/assignable').then((r) => r.data)

// ─── Admin user management (POST/DELETE /api/admin/users) ────────────────────
export const fetchAdminUsers = (params = {}) =>
    api.get('/admin/users', {params}).then((r) => r.data)

export const createUser = (payload) =>
    api.post('/admin/users', payload).then((r) => r.data)

export const setUserStatus = (userId, isActive) =>
    api.patch(`/admin/users/${userId}/status`, {isActive}).then((r) => r.data)

export const deleteUser = (userId) =>
    api.delete(`/admin/users/${userId}`).then((r) => r.data)
