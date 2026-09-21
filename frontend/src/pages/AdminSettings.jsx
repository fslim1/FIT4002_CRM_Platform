import {useCallback, useEffect, useRef, useState} from 'react';
import {FiAlertCircle, FiCheckCircle, FiSettings, FiShield, FiUser, FiUsers} from 'react-icons/fi';
import {fetchTeams} from '../api/teams';
import {fetchUsers} from '../api/users';
import GeneralSettingsTab from '../components/admin/GeneralSettingsTab';
import PermissionsTab from '../components/admin/PermissionsTab';
import TeamsTab from '../components/admin/TeamsTab';
import UsersTab from '../components/admin/UsersTab';
import '../styles/AdminSettings.css';

const TABS = [
    {key: 'general', label: 'General', icon: <FiSettings/>},
    {key: 'teams', label: 'Teams', icon: <FiUsers/>},
    {key: 'users', label: 'Users', icon: <FiUser/>},
    {key: 'permissions', label: 'Permissions', icon: <FiShield/>},
];

// Admin-only settings area. Hosts company settings, team management, the user directory and individual permissions.
function AdminSettings() {
    const [activeTab, setActiveTab] = useState('general');
    const [teams, setTeams] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState(null);
    const feedbackTimer = useRef(null);

    const notify = useCallback((type, message) => {
        clearTimeout(feedbackTimer.current);
        setFeedback({type, message});
        feedbackTimer.current = setTimeout(() => setFeedback(null), 4000);
    }, []);

    const loadDirectory = useCallback(
        () =>
            Promise.all([fetchTeams(), fetchUsers()])
                .then(([teamData, userData]) => {
                    setTeams(teamData.teams || []);
                    setUsers(userData.users || []);
                })
                .catch((err) => {
                    console.error(err);
                    notify('error', err.response?.data?.message || 'Failed to load settings data.');
                })
                .finally(() => setLoading(false)),
        [notify]
    );

    useEffect(() => {
        loadDirectory();
        return () => clearTimeout(feedbackTimer.current);
    }, [loadDirectory]);

    return (
        <div className="admin-page">
            <div className="admin-container">
                <div className="admin-header">
                    <h1 className="admin-title">Settings</h1>
                    <p className="admin-subtitle">
                        System configuration, teams, user access and permissions.
                    </p>
                </div>

                <div className="admin-tabs" role="tablist">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            role="tab"
                            aria-selected={activeTab === tab.key}
                            className={`admin-tab ${activeTab === tab.key ? 'active' : ''}`}
                            onClick={() => setActiveTab(tab.key)}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                </div>

                {feedback && (
                    <div className={`admin-feedback ${feedback.type}`} role="status">
                        {feedback.type === 'success' ? <FiCheckCircle/> : <FiAlertCircle/>}
                        {feedback.message}
                    </div>
                )}

                {activeTab === 'general' && <GeneralSettingsTab notify={notify}/>}

                {activeTab === 'teams' && (
                    <TeamsTab
                        teams={teams}
                        users={users}
                        loading={loading}
                        onDirectoryChanged={loadDirectory}
                        notify={notify}
                    />
                )}

                {activeTab === 'users' && (
                    <UsersTab
                        teams={teams}
                        onDirectoryChanged={loadDirectory}
                        notify={notify}
                    />
                )}

                {activeTab === 'permissions' && (
                    <PermissionsTab
                        users={users}
                        loading={loading}
                        onDirectoryChanged={loadDirectory}
                        notify={notify}
                    />
                )}
            </div>
        </div>
    );
}

export default AdminSettings;
