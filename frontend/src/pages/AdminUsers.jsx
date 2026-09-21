import {useCallback, useEffect, useRef, useState} from 'react';
import {
    FiAlertCircle,
    FiCheckCircle,
    FiPlus,
    FiSearch,
    FiTrash2,
    FiUsers,
    FiX,
    FiEye,
    FiEyeOff,
    FiShield,
    FiUserX,
    FiUserCheck
} from 'react-icons/fi';
import {fetchAdminUsers, createUser, deleteUser, setUserStatus, updateUserRole, updateUserTeam} from '../api/users';
import {fetchTeams} from '../api/teams';
import {useAuth} from '@/context/auth';
import PasswordChecklist from '@/components/PasswordChecklist';
import {isPasswordValid} from '@/lib/passwordPolicy';
import '../styles/AdminUsers.css';

const ROLES = ['Admin', 'Supervisor', 'User'];
const STATUS_OPTIONS = [
    {value: '', label: 'All statuses'},
    {value: 'active', label: 'Active'},
    {value: 'inactive', label: 'Inactive'},
];

const initialsOf = (name = '') =>
    name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

const EMPTY_FORM = {
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'User',
    teamId: '',
};

export default function AdminUsers({onDirectoryChanged}) {
    const {user: me} = useAuth();

    const [users, setUsers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('');
    const [teamFilter, setTeamFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [busyUserId, setBusyUserId] = useState(null);
    const debounceRef = useRef(null);

    const [feedback, setFeedback] = useState(null);
    const feedbackTimer = useRef(null);

    const notify = useCallback((type, message) => {
        clearTimeout(feedbackTimer.current);
        setFeedback({type, message});
        feedbackTimer.current = setTimeout(() => setFeedback(null), 5000);
    }, []);

    const [showCreate, setShowCreate] = useState(false);
    const [form, setForm] = useState(EMPTY_FORM);
    const [formError, setFormError] = useState('');
    const [creating, setCreating] = useState(false);
    const [showPass, setShowPass] = useState(false);
    const [showConfirmPass, setShowConfirmPass] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const [deactivateTarget, setDeactivateTarget] = useState(null);

    const loadUsers = useCallback(async (params = {}) => {
        try {
            setLoading(true);
            const data = await fetchAdminUsers(params);
            setUsers(data.users || []);
        } catch (err) {
            notify('error', err.response?.data?.message || 'Failed to load users.');
        } finally {
            setLoading(false);
        }
    }, [notify]);

    useEffect(() => {
        fetchTeams()
            .then((d) => setTeams(d.teams || []))
            .catch(() => {
            });
        loadUsers();
        return () => {
            clearTimeout(debounceRef.current);
            clearTimeout(feedbackTimer.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        const params = {};
        if (search.trim()) params.search = search.trim();
        if (roleFilter) params.role = roleFilter;
        if (teamFilter) params.team = teamFilter;
        if (statusFilter) params.status = statusFilter;
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => loadUsers(params), search ? 300 : 0);
        return () => clearTimeout(debounceRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, roleFilter, teamFilter, statusFilter]);

    const openCreate = () => {
        setForm(EMPTY_FORM);
        setFormError('');
        setShowPass(false);
        setShowConfirmPass(false);
        setShowCreate(true);
    };

    const closeCreate = () => {
        if (!creating) setShowCreate(false);
    };

    const handleFormChange = (e) => {
        const {name, value} = e.target;
        setForm((prev) => ({...prev, [name]: value}));
    };

    const validateForm = () => {
        if (!form.fullName.trim()) return 'Full name is required.';
        if (form.fullName.trim().length > 120) return 'Full name cannot exceed 120 characters.';
        if (!form.email.trim()) return 'Email is required.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return 'Please enter a valid email.';
        if (!form.password) return 'Password is required.';
        if (!isPasswordValid(form.password)) return 'Please meet all of the password requirements.';
        if (form.confirmPassword && form.password !== form.confirmPassword)
            return 'Password and confirm password do not match.';
        if (!ROLES.includes(form.role)) return 'Please select a valid role.';
        return null;
    };

    const handleCreateSubmit = async (e) => {
        e.preventDefault();
        const err = validateForm();
        if (err) {
            setFormError(err);
            return;
        }
        setFormError('');
        setCreating(true);
        try {
            const payload = {
                fullName: form.fullName.trim(),
                email: form.email.trim(),
                password: form.password,
                confirmPassword: form.confirmPassword || undefined,
                role: form.role,
                teamId: form.teamId || undefined,
            };
            const {user: created} = await createUser(payload);
            setUsers((prev) => [created, ...prev].sort((a, b) => a.fullName.localeCompare(b.fullName)));
            setShowCreate(false);
            onDirectoryChanged?.();
            notify('success', created.fullName + ' (' + created.role + ') created successfully.');
        } catch (err) {
            setFormError(err.response?.data?.message || 'Failed to create user. Please try again.');
        } finally {
            setCreating(false);
        }
    };

    const handleRoleChange = async (target, role) => {
        if (role === target.role) return;
        setBusyUserId(target.id);
        try {
            const {user: updated} = await updateUserRole(target.id, role);
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? {...u, ...updated} : u)));
            onDirectoryChanged?.();
            notify('success', `${updated.fullName} is now ${updated.role}. Permissions apply immediately.`);
        } catch (err) {
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
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? {...u, ...updated} : u)));
            onDirectoryChanged?.();
            notify(
                'success',
                updated.team?.name
                    ? `${updated.fullName} moved to ${updated.team.name}. Data visibility updated immediately.`
                    : `${updated.fullName} removed from their team.`
            );
        } catch (err) {
            notify('error', err.response?.data?.message || 'Failed to update team.');
        } finally {
            setBusyUserId(null);
        }
    };

    const applyStatus = async (target, isActive) => {
        setBusyUserId(target.id);
        try {
            const {user: updated} = await setUserStatus(target.id, isActive);
            setUsers((prev) => prev.map((u) => (u.id === updated.id ? {...u, ...updated} : u)));
            setDeactivateTarget(null);
            onDirectoryChanged?.();
            notify(
                'success',
                updated.isActive
                    ? `${updated.fullName} can sign in again.`
                    : `${updated.fullName} has been deactivated and can no longer sign in.`
            );
        } catch (err) {
            notify('error', err.response?.data?.message || 'Failed to update account status.');
            setDeactivateTarget(null);
        } finally {
            setBusyUserId(null);
        }
    };

    // Reopening an account restores nothing that was lost, so it needs no
    // confirmation; closing one cuts someone off mid-session and does.
    const handleStatusToggle = (target) => {
        if (target.isActive) setDeactivateTarget(target);
        else applyStatus(target, true);
    };

    const handleDeleteConfirm = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await deleteUser(deleteTarget.id);
            setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
            onDirectoryChanged?.();
            notify('success', deleteTarget.fullName + "'s account has been permanently deleted.");
            setDeleteTarget(null);
        } catch (err) {
            notify('error', err.response?.data?.message || 'Failed to delete user.');
            setDeleteTarget(null);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="admin-page">
            <div className="admin-container">
                <div className="admin-header">
                    <h1 className="admin-title">User Management</h1>
                    <p className="admin-subtitle">
                        Create and manage the accounts, roles and teams of your company.
                    </p>
                </div>

                {feedback && (
                    <div className={'admin-feedback ' + feedback.type} role="status" aria-live="polite">
                        {feedback.type === 'success' ? <FiCheckCircle/> : <FiAlertCircle/>}
                        <span>{feedback.message}</span>
                        <button className="admin-feedback-close" onClick={() => setFeedback(null)} aria-label="Dismiss">
                            <FiX/>
                        </button>
                    </div>
                )}

                <div className="aum-toolbar">
                    <div className="admin-search">
                        <FiSearch/>
                        <input
                            id="aum-search"
                            type="text"
                            placeholder="Search by name or email..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            aria-label="Search users"
                        />
                    </div>

                    <select
                        id="aum-role-filter"
                        className="admin-select"
                        value={roleFilter}
                        onChange={(e) => setRoleFilter(e.target.value)}
                        aria-label="Filter by role"
                    >
                        <option value="">All roles</option>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>

                    <select
                        id="aum-team-filter"
                        className="admin-select"
                        value={teamFilter}
                        onChange={(e) => setTeamFilter(e.target.value)}
                        aria-label="Filter by team"
                    >
                        <option value="">All teams</option>
                        {teams.map((t) => (
                            <option key={t.id || t._id} value={t.id || t._id}>{t.name}</option>
                        ))}
                        <option value="none">No team</option>
                    </select>

                    <select
                        id="aum-status-filter"
                        className="admin-select"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        aria-label="Filter by status"
                    >
                        {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>

                    <span className="admin-count"><FiUsers/> {users.length} user{users.length !== 1 ? 's' : ''}</span>

                    <button id="aum-create-btn" className="aum-create-btn" onClick={openCreate}>
                        <FiPlus/> Create User
                    </button>
                </div>

                <div className="admin-card fills">
                    {loading ? (
                        <div className="aum-loading">
                            <div className="aum-spinner"/>
                            <p>Loading users...</p>
                        </div>
                    ) : (
                        <div className="admin-table-wrapper">
                            <table className="admin-table" aria-label="User directory">
                                <thead>
                                <tr>
                                    <th>User</th>
                                    <th>Role</th>
                                    <th>Team</th>
                                    <th>Status</th>
                                    <th>Created</th>
                                    <th style={{width: 110}}>Actions</th>
                                </tr>
                                </thead>
                                <tbody>
                                {users.map((u) => {
                                    const isMe = String(u.id) === String(me?.id);
                                    return (
                                        <tr key={u.id} className={!u.isActive ? 'aum-row-inactive' : ''}>
                                            <td>
                                                <div className="admin-user-cell">
                                                    <div className={'admin-avatar' + (!u.isActive ? ' inactive' : '')}>
                                                        {initialsOf(u.fullName) || '?'}
                                                    </div>
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
                                                <div className="aum-assign-cell">
                            <span className={'admin-role-badge role-' + u.role.toLowerCase()}>
                              {u.role}
                            </span>
                                                    <select
                                                        className="admin-select compact"
                                                        value={u.role}
                                                        disabled={busyUserId === u.id || isMe}
                                                        title={isMe ? 'You cannot change your own role' : 'Assign role'}
                                                        onChange={(e) => handleRoleChange(u, e.target.value)}
                                                        aria-label={'Role for ' + u.fullName}
                                                    >
                                                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                                                    </select>
                                                </div>
                                            </td>
                                            <td>
                                                <select
                                                    className="admin-select compact"
                                                    value={u.team?.id || u.team || ''}
                                                    disabled={busyUserId === u.id}
                                                    onChange={(e) => handleTeamChange(u, e.target.value)}
                                                    aria-label={'Team for ' + u.fullName}
                                                >
                                                    <option value="">No team</option>
                                                    {teams.map((t) => (
                                                        <option key={t.id || t._id}
                                                                value={t.id || t._id}>{t.name}</option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td>
                          <span className={'aum-status-badge ' + (u.isActive ? 'active' : 'inactive')}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </span>
                                            </td>
                                            <td className="aum-date">
                                                {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '-'}
                                            </td>
                                            <td className="aum-actions-cell">
                                                {!isMe && (
                                                    <div className="aum-actions">
                                                        <button
                                                            id={'aum-status-' + u.id}
                                                            className={'aum-status-btn' + (u.isActive ? '' : ' reactivate')}
                                                            title={(u.isActive ? 'Deactivate ' : 'Reactivate ') + u.fullName}
                                                            onClick={() => handleStatusToggle(u)}
                                                            disabled={busyUserId === u.id}
                                                            aria-label={(u.isActive ? 'Deactivate ' : 'Reactivate ') + u.fullName}
                                                        >
                                                            {u.isActive ? <FiUserX/> : <FiUserCheck/>}
                                                        </button>
                                                        <button
                                                            id={'aum-delete-' + u.id}
                                                            className="aum-delete-btn"
                                                            title={'Delete ' + u.fullName}
                                                            onClick={() => setDeleteTarget(u)}
                                                            disabled={busyUserId === u.id}
                                                            aria-label={'Delete ' + u.fullName}
                                                        >
                                                            <FiTrash2/>
                                                        </button>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {users.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="admin-empty">
                                            <FiUsers style={{fontSize: 28, marginBottom: 6, opacity: 0.35}}/>
                                            <br/>
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

            {showCreate && (
                <div className="aum-overlay" role="dialog" aria-modal="true" aria-labelledby="aum-modal-title">
                    <div className="aum-modal">
                        <div className="aum-modal-header">
                            <div>
                                <h2 id="aum-modal-title">Create User</h2>
                                <p>Add a new member to your company.</p>
                            </div>
                            <button className="aum-modal-close" onClick={closeCreate} disabled={creating}
                                    aria-label="Close">
                                <FiX/>
                            </button>
                        </div>

                        <form onSubmit={handleCreateSubmit} noValidate className="aum-modal-form">
                            <div className="aum-field">
                                <label htmlFor="aum-fullName">Full Name <span className="aum-req">*</span></label>
                                <input
                                    id="aum-fullName"
                                    name="fullName"
                                    type="text"
                                    value={form.fullName}
                                    onChange={handleFormChange}
                                    placeholder="Jane Smith"
                                    autoComplete="name"
                                    disabled={creating}
                                    maxLength={120}
                                />
                            </div>

                            <div className="aum-field">
                                <label htmlFor="aum-email">Work Email <span className="aum-req">*</span></label>
                                <input
                                    id="aum-email"
                                    name="email"
                                    type="email"
                                    value={form.email}
                                    onChange={handleFormChange}
                                    placeholder="jane@company.com"
                                    autoComplete="email"
                                    disabled={creating}
                                />
                            </div>

                            <div className="aum-field">
                                <label htmlFor="aum-password">Temporary Password <span
                                    className="aum-req">*</span></label>
                                <div className="aum-pass-wrap">
                                    <input
                                        id="aum-password"
                                        name="password"
                                        type={showPass ? 'text' : 'password'}
                                        value={form.password}
                                        onChange={handleFormChange}
                                        placeholder="Choose a temporary password"
                                        autoComplete="new-password"
                                        disabled={creating}
                                    />
                                    <button type="button" className="aum-pass-toggle"
                                            onClick={() => setShowPass((v) => !v)} tabIndex={-1}
                                            aria-label={showPass ? 'Hide password' : 'Show password'}>
                                        {showPass ? <FiEyeOff/> : <FiEye/>}
                                    </button>
                                </div>
                                <div className="aum-pw-rules">
                                    <PasswordChecklist value={form.password}/>
                                </div>
                            </div>

                            <div className="aum-field">
                                <label htmlFor="aum-confirmPassword">Confirm Password</label>
                                <div className="aum-pass-wrap">
                                    <input
                                        id="aum-confirmPassword"
                                        name="confirmPassword"
                                        type={showConfirmPass ? 'text' : 'password'}
                                        value={form.confirmPassword}
                                        onChange={handleFormChange}
                                        placeholder="Repeat password"
                                        autoComplete="new-password"
                                        disabled={creating}
                                    />
                                    <button type="button" className="aum-pass-toggle"
                                            onClick={() => setShowConfirmPass((v) => !v)} tabIndex={-1}
                                            aria-label={showConfirmPass ? 'Hide' : 'Show'}>
                                        {showConfirmPass ? <FiEyeOff/> : <FiEye/>}
                                    </button>
                                </div>
                                {form.confirmPassword && form.password !== form.confirmPassword && (
                                    <span className="aum-field-hint error">Passwords do not match.</span>
                                )}
                            </div>

                            <div className="aum-field">
                                <label htmlFor="aum-role">Role <span className="aum-req">*</span></label>
                                <select
                                    id="aum-role"
                                    name="role"
                                    className="admin-select"
                                    value={form.role}
                                    onChange={handleFormChange}
                                    disabled={creating}
                                >
                                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                                </select>
                                <span className="aum-field-hint">
                  <FiShield style={{fontSize: 11}}/> The role can be changed later from this directory.
                </span>
                            </div>

                            {teams.length > 0 && (
                                <div className="aum-field">
                                    <label htmlFor="aum-teamId">Team <span
                                        className="aum-optional">(optional)</span></label>
                                    <select
                                        id="aum-teamId"
                                        name="teamId"
                                        className="admin-select"
                                        value={form.teamId}
                                        onChange={handleFormChange}
                                        disabled={creating}
                                    >
                                        <option value="">No team</option>
                                        {teams.map((t) => <option key={t.id || t._id}
                                                                  value={t.id || t._id}>{t.name}</option>)}
                                    </select>
                                </div>
                            )}

                            {formError && (
                                <div className="aum-form-error" role="alert">
                                    <FiAlertCircle/> {formError}
                                </div>
                            )}

                            <div className="aum-modal-actions">
                                <button type="button" className="aum-btn-secondary" onClick={closeCreate}
                                        disabled={creating}>
                                    Cancel
                                </button>
                                <button id="aum-submit-create" type="submit" className="aum-btn-primary"
                                        disabled={creating}>
                                    {creating ? 'Creating...' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {deactivateTarget && (
                <div className="aum-overlay" role="dialog" aria-modal="true" aria-labelledby="aum-deact-title">
                    <div className="aum-modal aum-modal-sm">
                        <div className="aum-deact-icon">
                            <FiUserX/>
                        </div>
                        <h2 id="aum-deact-title">Deactivate User?</h2>
                        <p className="aum-del-desc">
                            <strong>{deactivateTarget.fullName}</strong> ({deactivateTarget.email}) will be signed out
                            and blocked from signing in again.
                            <br/><br/>
                            Their deals, tasks and customers are kept, along with who owns what, and you can reactivate
                            the account at any time.
                        </p>
                        <div className="aum-modal-actions">
                            <button
                                id="aum-deact-cancel"
                                className="aum-btn-secondary"
                                onClick={() => setDeactivateTarget(null)}
                                disabled={busyUserId === deactivateTarget.id}
                            >
                                Cancel
                            </button>
                            <button
                                id="aum-deact-confirm"
                                className="aum-btn-danger"
                                onClick={() => applyStatus(deactivateTarget, false)}
                                disabled={busyUserId === deactivateTarget.id}
                            >
                                {busyUserId === deactivateTarget.id ? 'Deactivating...' : 'Yes, Deactivate'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteTarget && (
                <div className="aum-overlay" role="dialog" aria-modal="true" aria-labelledby="aum-del-title">
                    <div className="aum-modal aum-modal-sm">
                        <div className="aum-del-icon">
                            <FiTrash2/>
                        </div>
                        <h2 id="aum-del-title">Delete User?</h2>
                        <p className="aum-del-desc">
                            You are about to permanently delete <strong>{deleteTarget.fullName}</strong>&apos;s account
                            ({deleteTarget.email}).
                            <br/><br/>
                            Their deals, tasks and customers will be preserved but ownership attribution will be
                            cleared.
                            This action <strong>cannot be undone</strong>. Consider deactivating instead if you want to
                            block access while keeping history intact.
                        </p>
                        <div className="aum-modal-actions">
                            <button
                                id="aum-del-cancel"
                                className="aum-btn-secondary"
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                            >
                                Cancel
                            </button>
                            <button
                                id="aum-del-confirm"
                                className="aum-btn-danger"
                                onClick={handleDeleteConfirm}
                                disabled={deleting}
                            >
                                {deleting ? 'Deleting...' : 'Yes, Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}