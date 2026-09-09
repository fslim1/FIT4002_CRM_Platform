// Client-side mirror of backend/middleware/permissions.js: Admins hold every
// permission implicitly; everyone else needs an individual grant from
// Settings -> Permissions. The backend re-checks every request, so this only
// decides which controls are worth rendering.
export const can = (user, permission) => {
    if (!user) return false
    if (user.role === 'Admin') return true
    return Boolean(user.permissions && user.permissions[permission])
}
