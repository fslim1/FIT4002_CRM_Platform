import {useCallback, useEffect, useRef, useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {
    FiAlertCircle, FiBriefcase, FiCheckCircle, FiEdit2, FiHome, FiLogOut,
    FiMail, FiMapPin, FiPhone, FiSave, FiShield, FiTrendingUp, FiUser, FiX,
} from 'react-icons/fi';
import AppHeader from '@/components/AppHeader';
import {Button} from '@/components/ui/button';
import {
    clearPortalSession,
    fetchPortalDeals,
    fetchPortalProfile,
    updatePortalProfile,
} from '@/api/portal';
import '../styles/Portal.css';

const EDITABLE_FIELDS = [
    {key: 'fullName', label: 'Full Name', icon: <FiUser/>},
    {key: 'email', label: 'Email', icon: <FiMail/>},
    {key: 'phone', label: 'Phone', icon: <FiPhone/>},
    {key: 'company', label: 'Company', icon: <FiBriefcase/>},
    {key: 'address', label: 'Address', icon: <FiMapPin/>},
];

// Won is the end of the happy path; Lost is rendered as a terminal state instead.
const dealOutcome = (deal) =>
    deal.stage === 'Won' ? 'won' : deal.stage === 'Lost' ? 'lost' : 'open';

function DealProgress({deal}) {
    const lost = deal.stage === 'Lost';

    return (
        <div className="portal-stepper" aria-label={`Progress for ${deal.name}`}>
            {deal.stages.map((stage, idx) => {
                let cls = '';
                if (idx < deal.progressIndex) {
                    cls = 'done';
                } else if (idx === deal.progressIndex) {
                    if (lost) cls = 'done';
                    else cls = deal.stage === 'Won' ? 'done current' : 'current';
                }
                return (
                    <div key={stage} className={`portal-step ${cls}`}>
                        <div className="portal-step-dot">{cls.includes('done') ? '✓' : ''}</div>
                        <span className="portal-step-label">{stage}</span>
                    </div>
                );
            })}
            {lost && (
                <div className="portal-step lost current">
                    <div className="portal-step-dot">✕</div>
                    <span className="portal-step-label">Lost</span>
                </div>
            )}
        </div>
    );
}

// The customer's own space: profile details they can update, plus read-only
// stage progression and the person in charge of each deal.
function PortalDashboard() {
    const navigate = useNavigate();
    const [profile, setProfile] = useState(null);
    const [deals, setDeals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState(null);
    const feedbackTimer = useRef(null);

    const notify = useCallback((type, message) => {
        clearTimeout(feedbackTimer.current);
        setFeedback({type, message});
        feedbackTimer.current = setTimeout(() => setFeedback(null), 4000);
    }, []);

    useEffect(() => {
        const handleExpired = () => navigate('/portal', {replace: true});
        window.addEventListener('portal:session-expired', handleExpired);
        return () => window.removeEventListener('portal:session-expired', handleExpired);
    }, [navigate]);

    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchPortalProfile(), fetchPortalDeals()])
            .then(([profileRes, dealsRes]) => {
                if (cancelled) return;
                setProfile(profileRes.profile);
                setDeals(dealsRes.deals || []);
            })
            .catch((err) => {
                console.error(err);
                if (!cancelled && err.response?.status !== 401) {
                    notify('error', err.response?.data?.message || 'Failed to load your information.');
                }
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
            clearTimeout(feedbackTimer.current);
        };
    }, [notify]);

    const startEditing = () => {
        setForm({
            fullName: profile.fullName || '',
            email: profile.email || '',
            phone: profile.phone || '',
            company: profile.company || '',
            address: profile.address || '',
        });
        setEditing(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        for (const field of EDITABLE_FIELDS) {
            if (!String(form[field.key] ?? '').trim()) {
                notify('error', `${field.label} cannot be empty.`);
                return;
            }
        }
        setSaving(true);
        try {
            const {profile: updated} = await updatePortalProfile(form);
            setProfile(updated);
            setEditing(false);
            notify('success', 'Your details were updated and shared with your account team.');
        } catch (err) {
            console.error(err);
            notify('error', err.response?.data?.message || 'Failed to update your details.');
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        clearPortalSession();
        navigate('/portal', {replace: true});
    };

    return (
        <div className="portal-shell">
            <AppHeader
                actions={
                    <Button
                        onClick={handleLogout}
                        size="lg"
                        className="rounded-full"
                        style={{
                            background: '#253984',
                            color: '#EAF6FF',
                            border: '1px solid rgba(234,246,255,0.25)',
                        }}
                    >
                        <FiLogOut className="h-4 w-4"/>
                        Log out
                    </Button>
                }
            />

            <main className="portal-main">
                <h1 className="portal-heading">
                    {profile ? `Welcome, ${profile.fullName.split(' ')[0]}` : 'Welcome'}
                </h1>
                <p className="portal-subheading">
                    Keep your contact details up to date and follow the progress of your deals.
                </p>

                {feedback && (
                    <div className={`portal-feedback ${feedback.type}`} role="status">
                        {feedback.type === 'success' ? <FiCheckCircle/> : <FiAlertCircle/>}
                        {feedback.message}
                    </div>
                )}

                {loading ? (
                    <div className="portal-card">
                        <p className="portal-empty">Loading your information…</p>
                    </div>
                ) : (
                    <>
                        <div className="portal-card">
                            <div className="portal-card-header">
                                <div>
                                    <h2><FiUser/> My Profile</h2>
                                    <p className="portal-card-sub">
                                        Changes are saved straight to the CRM so your account team always
                                        has your latest details.
                                    </p>
                                </div>
                                {!editing && profile && (
                                    <button className="portal-btn ghost" onClick={startEditing}>
                                        <FiEdit2/> Edit Details
                                    </button>
                                )}
                            </div>

                            {profile && !editing && (
                                <div className="portal-profile-grid">
                                    {EDITABLE_FIELDS.map((f) => (
                                        <div className="portal-field" key={f.key}>
                                            <label>{f.icon} {f.label}</label>
                                            <div className="portal-field-value">{profile[f.key] || 'Not set'}</div>
                                        </div>
                                    ))}
                                    <div className="portal-field">
                                        <label><FiHome/> Role at Company</label>
                                        <div className="portal-field-value">
                                            {[profile.designation, profile.department].filter(Boolean).join(' · ') || 'Not set'}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {profile && editing && (
                                <form onSubmit={handleSave}>
                                    <div className="portal-profile-grid">
                                        {EDITABLE_FIELDS.map((f) => (
                                            <div className="portal-field" key={f.key}>
                                                <label htmlFor={`portal-${f.key}`}>{f.icon} {f.label}</label>
                                                <input
                                                    id={`portal-${f.key}`}
                                                    type={f.key === 'email' ? 'email' : 'text'}
                                                    value={form[f.key]}
                                                    onChange={(e) =>
                                                        setForm((prev) => ({...prev, [f.key]: e.target.value}))
                                                    }
                                                    disabled={saving}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="portal-actions">
                                        <button type="submit" className="portal-btn" disabled={saving}>
                                            <FiSave/> {saving ? 'Saving…' : 'Save Changes'}
                                        </button>
                                        <button
                                            type="button"
                                            className="portal-btn ghost"
                                            onClick={() => setEditing(false)}
                                            disabled={saving}
                                        >
                                            <FiX/> Cancel
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>

                        <div className="portal-card">
                            <div className="portal-card-header">
                                <div>
                                    <h2><FiTrendingUp/> My Deals</h2>
                                    <p className="portal-card-sub">
                                        A high-level view of where each deal stands and who is looking after it.
                                    </p>
                                </div>
                            </div>

                            {deals.length === 0 ? (
                                <p className="portal-empty">
                                    No deals are being tracked for you yet. Your account manager will set
                                    these up when the time comes.
                                </p>
                            ) : (
                                deals.map((deal) => {
                                    const outcome = dealOutcome(deal);
                                    return (
                                        <div className="portal-deal" key={deal.id}>
                                            <div className="portal-deal-top">
                                                <div>
                                                    <div className="portal-deal-name">{deal.name}</div>
                                                    <span className="portal-deal-owner">
                            <FiUser/> In charge: {deal.inCharge}
                          </span>
                                                </div>
                                                <span className={`portal-deal-status ${outcome}`}>
                          {outcome === 'open' ? deal.stage : outcome === 'won' ? 'Won' : 'Lost'}
                        </span>
                                            </div>
                                            <DealProgress deal={deal}/>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        <p className="portal-privacy-note">
                            <FiShield/> For confidentiality, this portal only shows your own profile,
                            each deal&apos;s stage progression and who is in charge of it.
                        </p>
                    </>
                )}
            </main>
        </div>
    );
}

export default PortalDashboard;
