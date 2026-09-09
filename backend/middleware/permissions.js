// Individual permission overrides for restricted features (Settings -> Permissions).
//
// By default only Admins can delete customer profiles, delete data records
// such as deals, notes, files and activities, or see data across every team.
// An Admin can grant any of these to a specific person; Admins themselves
// always hold every permission implicitly.

const PERMISSION_KEYS = ['deleteCustomers', 'deleteRecords', 'viewAllData']

const hasPermission = (user, permission) => {
    if (!user) return false
    if (user.role === 'Admin') return true
    return Boolean(user.permissions && user.permissions[permission])
}

const requirePermission = (permission) => (req, res, next) => {
    if (!hasPermission(req.user, permission)) {
        return res.status(403).json({message: 'Insufficient permissions'})
    }
    next()
}

module.exports = {PERMISSION_KEYS, hasPermission, requirePermission}
