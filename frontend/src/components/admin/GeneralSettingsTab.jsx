import { useEffect, useState } from 'react';
import { FiClock, FiDollarSign, FiGlobe, FiHome, FiSave } from 'react-icons/fi';
import { fetchSettings, updateSettings } from '../../api/settings';

const DEFAULT_TIMEZONE = 'Asia/Kuala_Lumpur';
const DEFAULT_CURRENCY = 'MYR';
const DEFAULT_LANGUAGE = 'English';

const FALLBACK_TIMEZONES = [
    'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Hong_Kong',
    'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Melbourne', 'Australia/Sydney',
    'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'America/New_York', 'America/Chicago',
    'America/Denver', 'America/Los_Angeles', 'Pacific/Auckland', 'UTC',
];

const CURRENCIES = ['MYR', 'SGD', 'USD', 'AUD', 'EUR', 'GBP', 'CAD', 'JPY', 'CNY', 'INR', 'IDR', 'THB', 'NZD'];

const LANGUAGES = [
    'English', 'Malay', 'Chinese', 'Tamil', 'Spanish', 'French',
    'German', 'Portuguese', 'Japanese', 'Korean', 'Hindi', 'Arabic',
];

const getTimezones = () => {
    try {
        const zones = Intl.supportedValuesOf?.('timeZone');
        return zones && zones.length ? zones : FALLBACK_TIMEZONES;
    } catch {
        return FALLBACK_TIMEZONES;
    }
};

// Company-wide settings: company name, timezone, currency and language.
function GeneralSettingsTab({ notify }) {
    const [form, setForm] = useState({
        companyName: '',
        timezone: DEFAULT_TIMEZONE,
        currency: DEFAULT_CURRENCY,
        language: DEFAULT_LANGUAGE,
    });
    const [initial, setInitial] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const timezones = getTimezones();

    useEffect(() => {
        let cancelled = false;
        fetchSettings()
            .then(({settings}) => {
                if (cancelled) return;
                const next = {
                    companyName: settings.companyName || '',
                    timezone: settings.timezone || DEFAULT_TIMEZONE,
                    currency: settings.currency || DEFAULT_CURRENCY,
                    language: settings.language || DEFAULT_LANGUAGE,
                };
                setForm(next);
                setInitial(next);
            })
            .catch((err) => {
                console.error(err);
                notify('error', err.response?.data?.message || 'Failed to load settings.');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const dirty =
        initial &&
        (form.companyName !== initial.companyName ||
            form.timezone !== initial.timezone ||
            form.currency !== initial.currency ||
            form.language !== initial.language);

    const handleChange = (field) => (e) =>
        setForm((prev) => ({...prev, [field]: e.target.value}));

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.companyName.trim()) {
            notify('error', 'Company name cannot be empty.');
            return;
        }
        setSaving(true);
        try {
            const {settings} = await updateSettings(form);
            const next = {
                companyName: settings.companyName,
                timezone: settings.timezone,
                currency: settings.currency,
                language: settings.language,
            };
            setForm(next);
            setInitial(next);
            notify('success', 'Settings saved. They apply across the CRM for your whole company.');
        } catch (err) {
            console.error(err);
            notify('error', err.response?.data?.message || 'Failed to save settings.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="admin-card">
            <div className="admin-card-header">
                <div>
                    <h2>System Settings</h2>
                    <p className="admin-card-sub">
                        Configuration for your company across the CRM. Renaming the company
                        updates every account in it. Only Admins can change these.
                    </p>
                </div>
            </div>

            {loading ? (
                <p className="admin-loading">Loading settings…</p>
            ) : (
                <form onSubmit={handleSave}>
                    <div className="admin-form-grid">
                        <div className="admin-form-group">
                            <label htmlFor="settings-company"><FiHome/> Company Name</label>
                            <input
                                id="settings-company"
                                type="text"
                                value={form.companyName}
                                onChange={handleChange('companyName')}
                                maxLength={120}
                                placeholder="Your company name"
                            />
                        </div>

                        <div className="admin-form-group">
                            <label htmlFor="settings-timezone"><FiClock/> Timezone</label>
                            <select
                                id="settings-timezone"
                                value={form.timezone}
                                onChange={handleChange('timezone')}
                            >
                                {!timezones.includes(form.timezone) && (
                                    <option value={form.timezone}>{form.timezone}</option>
                                )}
                                {timezones.map((tz) => (
                                    <option key={tz} value={tz}>{tz}</option>
                                ))}
                            </select>
                        </div>

                        <div className="admin-form-group">
                            <label htmlFor="settings-currency"><FiDollarSign/> Currency</label>
                            <select
                                id="settings-currency"
                                value={form.currency}
                                onChange={handleChange('currency')}
                            >
                                {!CURRENCIES.includes(form.currency) && (
                                    <option value={form.currency}>{form.currency}</option>
                                )}
                                {CURRENCIES.map((c) => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                            </select>
                        </div>

                        <div className="admin-form-group">
                            <label htmlFor="settings-language"><FiGlobe/> Language</label>
                            <select
                                id="settings-language"
                                value={form.language}
                                onChange={handleChange('language')}
                            >
                                {!LANGUAGES.includes(form.language) && (
                                    <option value={form.language}>{form.language}</option>
                                )}
                                {LANGUAGES.map((l) => (
                                    <option key={l} value={l}>{l}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button type="submit" className="admin-btn" disabled={saving || !dirty}>
                        <FiSave/> {saving ? 'Saving…' : dirty ? 'Save Changes' : 'Saved'}
                    </button>
                </form>
            )}
        </div>
    );
}

export default GeneralSettingsTab;
