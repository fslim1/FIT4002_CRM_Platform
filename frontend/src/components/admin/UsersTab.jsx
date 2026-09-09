import { useEffect, useRef, useState } from 'react';
import { FiSearch, FiUsers } from 'react-icons/fi';
import { fetchUsers, updateUserRole, updateUserTeam } from '../../api/users';
import { useAuth } from '@/context/auth';

const ROLES = ['Admin', 'Supervisor', 'User'];

const initialsOf = (name = '') =>
    name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('');

// Full user directory with search and filters, role assignment, and team assignment or transfer.
function UsersTab({ teams, onDirectoryChanged, notify }) {
    const {user: me} = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [teamFilter, setTeamFilter] = useState('');
    const [busyUserId, setBusyUserId] = useState(null);
    const debounceRef = useRef(null);

    const loadUsers = async (params) => {
        try {
            setLoading(true);
            const data = await fetchUsers(params);
            setUsers(data.users || []);
        } catch (err) {
            console.error(err);
            notify('error', err.response?.data?.message || 'Failed to load users.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const params = {};
        if (search.trim()) params.search = search.trim();
        if (roleFilter) params.role = roleFilter;
        if (teamFilter) params.team = teamFilter;

        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => loadUsers(params), search ? 300 : 0);
        return () => clearTimeout(debounceRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, roleFilter, teamFilter]);

    const applyUpdatedUser = (updated) => {
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
    };

    const handleRoleChange = async (target, role) => {
        if (role === target.role) return;
        setBusyUserId(target.id);
        try {
            const {user: updated} = await updateUserRole(target.id, role);
            applyUpdatedUser(updated);
            notify('success', `${updated.fullName} is now ${updated.role}. Permissions apply immediately.`);
            onDirectoryChanged();
        } catch (err) {
            console.error(err);
            notify('error', err.response?.data?.message || 'Failed to update role.');
        } finally {
            setBusyUserId(null);
        }
    };

    const handleTeamChange = async (target, teamId) => {
        const currentTeamId = target.team?.id || target.team || '';
        if (String(teamId) === String(currentTeamId)) return;
        setBusyUserId(target.id);
        try {
            const {user: updated} = await updateUserTeam(target.id, teamId || null);
            applyUpdatedUser(updated);
            notify(
                'success',
                updated.team?.name
                    ? `${updated.fullName} moved to ${updated.team.name}. Data visibility updated immediately.`
                    : `${updated.fullName} removed from their team.`
            );
            onDirectoryChanged();
        } catch (err) {
            console.error(err);
            notify('error', err.response?.data?.message || 'Failed to update team.');
        } finally {
            setBusyUserId(null);
        }
    };

    return (
        <div className="admin-tab-panel">
            <div className="admin-card fills">
                <div className="admin-card-header">
                    <div>
                        <h2>User Directory</h2>
                        <p className="admin-card-sub">
                            Search the directory, assign roles and move people between teams.
                        </p>
                    </div>
                </div>

                <div className="admin-toolbar">
                    <div className="admin-search">
                        <FiSearch/>
                        <input
                            type="text"
                            placeholder="Search by name or email…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            aria-label="Search users"
                        />
                    </div>

                    <select
                        className="admin-select"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        aria-label="Filter by role"
                    >
                        <option value="">All roles</option>
                        {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                        ))}
                    </select>

                    <select
                        className="admin-select"
                        value={teamFilter}
                        onChange={(e) => setTeamFilter(e.target.value)}
                        aria-label="Filter by team"
                    >
                        <option value="">All teams</option>
                        {teams.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                        <option value="none">No team</option>
                    </select>

                    <span className="admin-count">
          <FiUsers/> {users.length} user{users.length === 1 ? '' : 's'}
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
                                <th>Team</th>
                                <th>Joined</th>
                            </tr>
                            </thead>
                            <tbody>
                            {users.map((u) => {
                                const isMe = String(u.id) === String(me?.id);
                                const busy = busyUserId === u.id;
                                const supervisedTeam = teams.find(
                                    (t) => t.supervisor && String(t.supervisor.id) === String(u.id)
                                );
                                return (
                                    <tr key={u.id}>
                                        <td>
                                            <div className="admin-user-cell">
                                                <div className="admin-avatar">{initialsOf(u.fullName) || '?'}</div>
                                                <div>
                          <span className="admin-user-name">
                            {u.fullName}
                              {isMe && <span className="admin-you-badge">You</span>}
                          </span>
                                                    <span className="admin-user-email">{u.email}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
                                                <span
                                                    className={`admin-role-badge role-${u.role.toLowerCase()}`}>{u.role}</span>
                                                <select
                                                    className="admin-select compact"
                                                    value={u.role}
                                                    disabled={busy || isMe}
                                                    title={isMe ? 'You cannot change your own role' : 'Assign role'}
                                                    onChange={(e) => handleRoleChange(u, e.target.value)}
                                                    aria-label={`Role for ${u.fullName}`}
                                                >
                                                    {ROLES.map((r) => (
                                                        <option key={r} value={r}>{r}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </td>
                                        <td>
                                            <select
                                                className="admin-select compact"
                                                value={u.team?.id || u.team || ''}
                                                disabled={busy}
                                                onChange={(e) => handleTeamChange(u, e.target.value)}
                                                aria-label={`Team for ${u.fullName}`}
                                            >
                                                <option value="">No team</option>
                                                {teams.map((t) => (
                                                    <option key={t.id} value={t.id}>{t.name}</option>
                                                ))}
                                            </select>
                                            {supervisedTeam && (
                                                <span className="admin-supervises-hint">
                          ⚑ Supervises {supervisedTeam.name}
                        </span>
                                            )}
                                        </td>
                                        <td>{u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'Not set'}</td>
                                    </tr>
                                );
                            })}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="admin-empty">
                                        No users match your search or filters.
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

export default UsersTab;
