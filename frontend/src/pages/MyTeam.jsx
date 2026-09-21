import {useEffect, useState} from 'react';
import {FiLock, FiShare2, FiUsers} from 'react-icons/fi';
import {fetchMyTeam} from '../api/teams';
import {useAuth} from '@/context/auth';
import '../styles/MyTeam.css';
import '../styles/AdminSettings.css';

const initialsOf = (name = '') =>
    name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('');

// Supervisors can see their team and whether customer sharing between team members is currently active.
function MyTeam() {
    const {user} = useAuth();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        fetchMyTeam()
            .then((res) => {
                if (!cancelled) setData(res);
            })
            .catch((err) => {
                console.error(err);
                if (!cancelled) setError(err.response?.data?.message || 'Failed to load your team.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) {
        return (
            <div className="myteam-page">
                <div className="myteam-container">
                    <div className="myteam-header">
                        <h1 className="myteam-title">My Team</h1>
                        <p className="myteam-subtitle">Loading your team…</p>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="myteam-page">
                <div className="myteam-container">
                    <div className="myteam-header">
                        <h1 className="myteam-title">My Team</h1>
                        <p className="myteam-subtitle" style={{color: '#a02020'}}>{error}</p>
                    </div>
                </div>
            </div>
        );
    }

    const team = data?.team;
    const members = data?.members || [];

    if (!team) {
        return (
            <div className="myteam-page">
                <div className="myteam-container">
                    <div className="myteam-header">
                        <h1 className="myteam-title">My Team</h1>
                        <p className="myteam-subtitle">
                            Your team, its members, and the current sharing status.
                        </p>
                    </div>
                    <div className="myteam-empty-card">
                        <FiUsers className="myteam-empty-icon"/>
                        <h2>You&apos;re not assigned to a team yet</h2>
                        <p>Ask an Admin to add you to a team from Settings → Users.</p>
                    </div>
                </div>
            </div>
        );
    }

    const sharingOn = team.sharingEnabled;

    return (
        <div className="myteam-page">
            <div className="myteam-container">
                <div className="myteam-header">
                    <h1 className="myteam-title">My Team</h1>
                    <p className="myteam-subtitle">
                        Your team, its members, and the current customer sharing status.
                    </p>
                </div>

                <div className="myteam-summary">
                    <div className="myteam-card">
                        <span className="myteam-card-label">Team</span>
                        <span className="myteam-card-value"><FiUsers/> {team.name}</span>
                        <p className="myteam-card-note">
                            {members.length} member{members.length === 1 ? '' : 's'}
                            {typeof data.customerCount === 'number'
                                ? ` · ${data.customerCount} customer record${data.customerCount === 1 ? '' : 's'}`
                                : ''}
                        </p>
                    </div>

                    <div className="myteam-card">
                        <span className="myteam-card-label">Supervisor</span>
                        <span className="myteam-card-value">
            {team.supervisor ? team.supervisor.fullName : 'Not designated'}
          </span>
                        <p className="myteam-card-note">
                            {team.supervisor?.email || 'An Admin can designate a supervisor in Settings → Teams.'}
                        </p>
                    </div>

                    <div className="myteam-card">
                        <span className="myteam-card-label">Customer Sharing</span>
                        <span className={`myteam-sharing-pill ${sharingOn ? 'on' : 'off'}`}>
            {sharingOn ? <FiShare2/> : <FiLock/>}
                            {sharingOn ? 'Sharing Active' : 'Sharing Off'}
          </span>
                        <p className="myteam-card-note">
                            {sharingOn
                                ? 'Team members can view customer records owned by their teammates and collaborate on shared accounts.'
                                : 'Each member only sees their own customer records. Only an Admin can change this in Settings.'}
                        </p>
                    </div>
                </div>

                <div className="myteam-members-card">
                    <h2>Members</h2>
                    <div className="admin-table-wrapper">
                        <table className="admin-table">
                            <thead>
                            <tr>
                                <th>Member</th>
                                <th>Role</th>
                            </tr>
                            </thead>
                            <tbody>
                            {members.map((m) => (
                                <tr key={m.id}>
                                    <td>
                                        <div className="admin-user-cell">
                                            <div className="admin-avatar">{initialsOf(m.fullName) || '?'}</div>
                                            <div>
                        <span className="admin-user-name">
                          {m.fullName}
                            {String(m.id) === String(user?.id) && (
                                <span className="admin-you-badge">You</span>
                            )}
                        </span>
                                                <span className="admin-user-email">{m.email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        <span
                                            className={`admin-role-badge role-${m.role.toLowerCase()}`}>{m.role}</span>
                                    </td>
                                </tr>
                            ))}
                            {members.length === 0 && (
                                <tr>
                                    <td colSpan="2" className="admin-empty">No members in this team yet.</td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default MyTeam;
