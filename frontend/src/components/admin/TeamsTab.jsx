import { useState } from 'react';
import { FiCheck, FiEdit2, FiPlus, FiTrash2, FiX } from 'react-icons/fi';
import { createTeam, deleteTeam, updateTeam } from '../../api/teams';

// Create, rename and delete teams, designate a supervisor per team, and
// toggle customer sharing between the members of each team.
function TeamsTab({ teams, users, loading, onDirectoryChanged, notify }) {
    const [newTeamName, setNewTeamName] = useState('');
    const [creating, setCreating] = useState(false);
    const [busyTeamId, setBusyTeamId] = useState(null);
    const [renamingId, setRenamingId] = useState(null);
    const [renameValue, setRenameValue] = useState('');
    const [confirmDelete, setConfirmDelete] = useState(null);

    // Admins cannot be designated as team supervisors
    const supervisorCandidates = users.filter((u) => u.role !== 'Admin');

    const handleCreate = async (e) => {
        e.preventDefault();
        const name = newTeamName.trim();
        if (!name) return;
        setCreating(true);
        try {
            await createTeam(name);
            setNewTeamName('');
            notify('success', `Team "${name}" created.`);
            onDirectoryChanged();
        } catch (err) {
            console.error(err);
            notify('error', err.response?.data?.message || 'Failed to create team.');
        } finally {
            setCreating(false);
        }
    };

    const startRename = (team) => {
        setRenamingId(team.id);
        setRenameValue(team.name);
    };

    const submitRename = async (team) => {
        const name = renameValue.trim();
        if (!name || name === team.name) {
            setRenamingId(null);
            return;
        }
        setBusyTeamId(team.id);
        try {
            await updateTeam(team.id, {name});
            notify('success', `Team renamed to "${name}". The new name applies everywhere.`);
            setRenamingId(null);
            onDirectoryChanged();
        } catch (err) {
            console.error(err);
            notify('error', err.response?.data?.message || 'Failed to rename team.');
        } finally {
            setBusyTeamId(null);
        }
    };

    const handleSupervisorChange = async (team, supervisorId) => {
        setBusyTeamId(team.id);
        try {
            const {team: updated} = await updateTeam(team.id, {
                supervisorId: supervisorId || null,
            });
            notify(
                'success',
                updated.supervisor
                    ? `${updated.supervisor.fullName} now supervises ${updated.name}.`
                    : `${updated.name} no longer has a designated supervisor.`
            );
            onDirectoryChanged();
        } catch (err) {
            console.error(err);
            notify('error', err.response?.data?.message || 'Failed to update supervisor.');
        } finally {
            setBusyTeamId(null);
        }
    };

    const handleSharingToggle = async (team) => {
        setBusyTeamId(team.id);
        try {
            const {team: updated} = await updateTeam(team.id, {
                sharingEnabled: !team.sharingEnabled,
            });
            notify(
                'success',
                `Customer sharing for ${updated.name} is now ${updated.sharingEnabled ? 'ACTIVE' : 'OFF'}. The change takes effect immediately.`
            );
            onDirectoryChanged();
        } catch (err) {
            console.error(err);
            notify('error', err.response?.data?.message || 'Failed to update sharing.');
        } finally {
            setBusyTeamId(null);
        }
    };

    const handleDelete = async () => {
        const team = confirmDelete;
        if (!team) return;
        setBusyTeamId(team.id);
        try {
            await deleteTeam(team.id);
            notify('success', `Team "${team.name}" deleted. Its members are no longer assigned to a team.`);
            setConfirmDelete(null);
            onDirectoryChanged();
        } catch (err) {
            console.error(err);
            notify('error', err.response?.data?.message || 'Failed to delete team.');
        } finally {
            setBusyTeamId(null);
        }
    };

    return (
        <div className="admin-tab-panel">
            <div className="admin-card">
                <div className="admin-card-header">
                    <div>
                        <h2>Create a Team</h2>
                        <p className="admin-card-sub">
                            Teams control which customers, leads and deals each person can see.
                        </p>
                    </div>
                </div>
                <form className="admin-inline-form" onSubmit={handleCreate}>
                    <input
                        type="text"
                        placeholder="Team name, e.g. APAC Sales"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        maxLength={80}
                        aria-label="New team name"
                    />
                    <button type="submit" className="admin-btn" disabled={creating || !newTeamName.trim()}>
                        <FiPlus/> {creating ? 'Creating…' : 'Create Team'}
                    </button>
                </form>
            </div>

            <div className="admin-card fills">
                <div className="admin-card-header">
                    <div>
                        <h2>Teams</h2>
                        <p className="admin-card-sub">
                            One supervisor per team. The sharing toggle lets members of a team see
                            each other&apos;s customer records.
                        </p>
                    </div>
                </div>

                {loading ? (
                    <p className="admin-loading">Loading teams…</p>
                ) : (
                    <div className="admin-table-wrapper">
                        <table className="admin-table">
                            <thead>
                            <tr>
                                <th>Team</th>
                                <th>Supervisor</th>
                                <th>Members</th>
                                <th>Customer Sharing</th>
                                <th></th>
                            </tr>
                            </thead>
                            <tbody>
                            {teams.map((team) => {
                                const busy = busyTeamId === team.id;
                                return (
                                    <tr key={team.id}>
                                        <td>
                                            {renamingId === team.id ? (
                                                <div className="admin-rename-row">
                                                    <input
                                                        value={renameValue}
                                                        onChange={(e) => setRenameValue(e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') submitRename(team);
                                                            if (e.key === 'Escape') setRenamingId(null);
                                                        }}
                                                        maxLength={80}
                                                        autoFocus
                                                        aria-label={`Rename team ${team.name}`}
                                                    />
                                                    <button
                                                        className="admin-icon-btn"
                                                        onClick={() => submitRename(team)}
                                                        disabled={busy}
                                                        title="Save name"
                                                        aria-label="Save team name"
                                                    >
                                                        <FiCheck/>
                                                    </button>
                                                    <button
                                                        className="admin-icon-btn"
                                                        onClick={() => setRenamingId(null)}
                                                        title="Cancel"
                                                        aria-label="Cancel rename"
                                                    >
                                                        <FiX/>
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className="admin-team-name">
                            {team.name}
                                                    <button
                                                        className="admin-icon-btn"
                                                        onClick={() => startRename(team)}
                                                        title="Rename team"
                                                        aria-label={`Rename ${team.name}`}
                                                    >
                              <FiEdit2 />
                            </button>
                          </span>
                                            )}
                                        </td>
                                        <td>
                                            <select
                                                className="admin-select compact"
                                                value={team.supervisor?.id || ''}
                                                disabled={busy}
                                                onChange={(e) => handleSupervisorChange(team, e.target.value)}
                                                aria-label={`Supervisor for ${team.name}`}
                                            >
                                                <option value="">No supervisor</option>
                                                {supervisorCandidates.map((u) => (
                                                    <option key={u.id} value={u.id}>
                                                        {u.fullName} ({u.role})
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>{team.memberCount}</td>
                                        <td>
                                            <div className="admin-sharing-cell">
                                                <label className="admin-switch">
                                                    <input
                                                        type="checkbox"
                                                        checked={team.sharingEnabled}
                                                        disabled={busy}
                                                        onChange={() => handleSharingToggle(team)}
                                                        aria-label={`Toggle customer sharing for ${team.name}`}
                                                    />
                                                    <span className="slider"/>
                                                </label>
                                                <span
                                                    className={`admin-sharing-state ${team.sharingEnabled ? 'on' : 'off'}`}>
                            {team.sharingEnabled ? 'Active' : 'Off'}
                          </span>
                                            </div>
                                        </td>
                                        <td style={{textAlign: 'right'}}>
                                            <button
                                                className="admin-btn danger"
                                                onClick={() => setConfirmDelete(team)}
                                                disabled={busy}
                                            >
                                                <FiTrash2/> Delete
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {teams.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="admin-empty">
                                        No teams yet. Create your first team above.
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {confirmDelete && (
                <div className="admin-modal-overlay" onClick={() => setConfirmDelete(null)}>
                    <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
                        <h3>Delete Team</h3>
                        <p>
                            Are you sure you want to delete <strong>{confirmDelete.name}</strong>?
                            Its {confirmDelete.memberCount} member{confirmDelete.memberCount === 1 ? '' : 's'} will
                            be reassigned to no team. Customer records are kept.
                        </p>
                        <div className="admin-modal-actions">
                            <button className="admin-btn ghost" onClick={() => setConfirmDelete(null)}>
                                Cancel
                            </button>
                            <button
                                className="confirm-delete-btn"
                                onClick={handleDelete}
                                disabled={busyTeamId === confirmDelete.id}
                            >
                                Delete Team
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default TeamsTab;
