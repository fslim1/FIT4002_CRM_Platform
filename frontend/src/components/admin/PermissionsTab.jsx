import {useState} from 'react';
import {FiInfo, FiSearch, FiShield} from 'react-icons/fi';
import {updateUserPermissions} from '../../api/users';

// Individual permission overrides for restricted features. By default only
// Admins can delete customer profiles, delete data records or see every
// team's data. Admins can grant these to specific people here; Admins
// themselves always have full access.
const PERMISSION_COLUMNS = [
    {
        key: 'deleteCustomers',
        label: 'Delete Customers',
        hint: 'Delete customer profiles.',
    },
    {
        key: 'deleteRecords',
        label: 'Delete Records',
        hint: 'Delete deals, notes, activities and files.',
    },
    {
        key: 'viewAllData',
        label: 'View All Data',
        hint: "See every team's customers, deals, activities and tasks.",
    },
];

const initialsOf = (name = '') =>
    name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('');

function PermissionsTab({users, loading, onDirectoryChanged, notify}) {
    const [search, setSearch] = useState('');
    const [busyKey, setBusyKey] = useState(null);

    const query = search.trim().toLowerCase();
    const visibleUsers = users.filter(
        (u) =>
            !query ||
            u.fullName.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query)
    );

    const handleToggle = async (user, key, nextValue) => {
        setBusyKey(`${user.id}:${key}`);
        try {
            const {user: updated} = await updateUserPermissions(user.id, {[key]: nextValue});
            const label = PERMISSION_COLUMNS.find((c) => c.key === key)?.label || key;
            notify(
                'success',
                `${label} ${updated.permissions[key] ? 'granted to' : 'revoked from'} ${updated.fullName}. Takes effect immediately.`
            );
            onDirectoryChanged();
        } catch (err) {
            console.error(err);
            notify('error', err.response?.data?.message || 'Failed to update permissions.');
        } finally {
            setBusyKey(null);
        }
    };

    return (
        <div className="admin-tab-panel">
            <div className="admin-card fills">
                <div className="admin-card-header">
                    <div>
                        <h2><FiShield/> Individual Permissions</h2>
                        <p className="admin-card-sub">
                            Grant specific people access to restricted features. By default,
                            only Admins have them.
                        </p>
                    </div>
                </div>

                <p className="admin-perm-note">
                    <FiInfo/> Delete permissions still respect team visibility: a person can
                    only delete records they are allowed to see. Admins always have full access
                    and cannot be edited here.
                </p>

                <div className="admin-toolbar">
                    <div className="admin-search">
                        <FiSearch/>
                        <input
                            type="text"
                            placeholder="Search by name or email…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            aria-label="Search users for permissions"
                        />
                    </div>
                    <span className="admin-count">
            {visibleUsers.length} user{visibleUsers.length === 1 ? '' : 's'}
          </span>
                </div>

                {loading ? (
                    <p className="admin-loading">Loading users…</p>
                ) : (
                    <div className="admin-table-wrapper">
                        <table className="admin-table">
                            <thead>
                            <tr>
                                <th>User</th>
                                <th>Role</th>
                                {PERMISSION_COLUMNS.map((col) => (
                                    <th key={col.key} title={col.hint}>
                      <span className="admin-th-stack">
                        {col.label}
                          <span className="admin-th-hint">{col.hint}</span>
                      </span>
                                    </th>
                                ))}
                            </tr>
                            </thead>
                            <tbody>
                            {visibleUsers.map((u) => {
                                const isAdmin = u.role === 'Admin';
                                return (
                                    <tr key={u.id}>
                                        <td>
                                            <div className="admin-user-cell">
                                                <div className="admin-avatar">{initialsOf(u.fullName) || '?'}</div>
                                                <div>
                                                    <span className="admin-user-name">{u.fullName}</span>
                                                    <span className="admin-user-email">{u.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <span
                                                className={`admin-role-badge role-${u.role.toLowerCase()}`}>{u.role}</span>
                                        </td>
                                        {isAdmin ? (
                                            <td colSpan={PERMISSION_COLUMNS.length}>
                          <span className="admin-full-access">
                            <FiShield/> Full access
                          </span>
                                            </td>
                                        ) : (
                                            PERMISSION_COLUMNS.map((col) => {
                                                const value = Boolean(u.permissions?.[col.key]);
                                                const busy = busyKey === `${u.id}:${col.key}`;
                                                return (
                                                    <td key={col.key}>
                                                        <div className="admin-sharing-cell">
                                                            <label className="admin-switch">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={value}
                                                                    disabled={busy}
                                                                    onChange={() => handleToggle(u, col.key, !value)}
                                                                    aria-label={`${col.label} for ${u.fullName}`}
                                                                />
                                                                <span className="slider"/>
                                                            </label>
                                                            <span
                                                                className={`admin-sharing-state ${value ? 'on' : 'off'}`}>
                                  {value ? 'Granted' : 'Default'}
                                </span>
                                                        </div>
                                                    </td>
                                                );
                                            })
                                        )}
                                    </tr>
                                );
                            })}
                            {visibleUsers.length === 0 && (
                                <tr>
                                    <td colSpan={2 + PERMISSION_COLUMNS.length} className="admin-empty">
                                        No users match your search.
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}

export default PermissionsTab;
