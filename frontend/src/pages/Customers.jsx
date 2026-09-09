import { useState, useEffect } from 'react';
import api from '../services/api';
import AddCustomerModal from '../components/AddCustomerModal';
import EmailComposer from '../components/EmailComposer';
import '../styles/EmailComposer.css';
import {Link} from 'react-router-dom';
import '../styles/Customers.css';

// Reusable avatar component with graceful fallback to company initials or user symbol
const CompanyAvatar = ({companyLogo, companyName, size = 'normal'}) => {
    const [imgError, setImgError] = useState(false);

    const imageUrl = companyLogo ? `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}${companyLogo}` : null;

    if (imageUrl && !imgError) {
        return (
            <img
                src={imageUrl}
                alt={`${companyName || 'Company'} logo`}
                className={size === 'small' ? 'contact-avatar small' : 'contact-avatar'}
                onError={() => setImgError(true)}
            />
        );
    }

    const initials = companyName
        ? companyName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
        : '👤';

    return (
        <div className={size === 'small' ? 'contact-avatar-placeholder small' : 'contact-avatar-placeholder'}>
            {initials}
        </div>
    );
};

const Customers = () => {
    const [customers, setCustomers] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [emailModalData, setEmailModalData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');

    const fetchCustomers = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const res = await api.get('/customers');
            setCustomers(res.data);
            if (showLoading) setError(null);
        } catch (err) {
            console.error(err);
            if (showLoading) setError('Failed to load customers.');
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    const handleInteraction = async (customer, type) => {
        if (type === 'Email') {
            setEmailModalData(customer);
            return;
        }

        try {
            await api.post(`/customers/${customer._id}/interactions`, {
                type: type,
                details: `Initiated ${type} contact from Customer List`
            });

            fetchCustomers(false); // Silent refresh to avoid unmounting DOM
        } catch (err) {
            console.error(`Failed to log ${type} interaction`, err);
        }
    };

    const handleEmailSent = async (data) => {
        if (!emailModalData) return;
        try {
            await api.post(`/customers/${emailModalData._id}/interactions`, {
                type: 'Email',
                details: `Sent Email - Subject: ${data.desc}`
            });
            fetchCustomers(false);
        } catch (err) {
            console.error("Failed to log email interaction", err);
        }
    };

    const handleCustomerAdded = () => {
        fetchCustomers(); // Refresh the list
    };

    const formatActivityDate = (dateString) => {
        if (!dateString) return '';
        const date = new Date(dateString);
        const today = new Date();

        if (date.getDate() === today.getDate() &&
            date.getMonth() === today.getMonth() &&
            date.getFullYear() === today.getFullYear()) {
            return 'Today';
        }

        return date.toLocaleDateString();
    };

    // Client-side search logic
    const filteredCustomers = customers.filter(cust => {
        const query = searchQuery.toLowerCase().trim();
        if (!query) return true;
        return (
            cust.fullName?.toLowerCase().includes(query) ||
            cust.email?.toLowerCase().includes(query) ||
            cust.company?.toLowerCase().includes(query) ||
            cust.designation?.toLowerCase().includes(query)
        );
    });

    return (
        <div className="customers-page">
            <div className="customer-list-container">
                <div className="pipeline-title-row">
                    <h1 className="pipeline-title">Customers</h1>
                </div>

                <div className="pipeline-action-bar">
                    <button className="btn-add-lead" onClick={() => setIsModalOpen(true)}>
                        + Add Contact
                    </button>

                    <div className="search-wrapper" style={{marginLeft: 'auto'}}>
                        <input
                            className="btn-search"
                            type="text"
                            placeholder="Search customers..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                {loading ? (
                    <p className="loading-msg"
                       style={{fontFamily: 'Inter', fontSize: '14px', color: '#555', padding: '20px'}}>Loading
                        customers...</p>
                ) : error ? (
                    <p className="error-msg" style={{padding: '20px'}}>{error}</p>
                ) : (
                    <div className="customers-table-wrapper">
                        <table className="customers-table">
                            <thead>
                            <tr>
                                <th>Contact</th>
                                <th>Company</th>
                                <th>Designation</th>
                                <th>Pipeline Stage</th>
                                <th>Assignee</th>
                                <th>Last Activity</th>
                            </tr>
                            </thead>
                            <tbody>
                            {filteredCustomers.map((cust) => (
                                <tr key={cust._id}>
                                    <td>
                                        <Link to={`/customers/${cust._id}`} className="contact-cell">
                                            <CompanyAvatar key={cust._id + '-' + (cust.companyLogo || '')}
                                                           companyLogo={cust.companyLogo} companyName={cust.company}/>
                                            <div className="contact-info">
                                        <span className="contact-name">
                                            {cust.fullName}
                                            {/* Records owned by teammates carry a shared sign */}
                                            {cust.shared && (
                                                <span className="shared-badge"
                                                      title={`Shared by ${cust.owner?.fullName || 'a teammate'}`}>
                                                    Shared
                                                </span>
                                            )}
                                        </span>
                                                <span className="contact-email">{cust.email}</span>
                                            </div>
                                        </Link>
                                    </td>
                                    <td>
                                        <div className="company-name">{cust.company}</div>
                                    </td>
                                    <td>
                                        <div className="designation">{cust.designation}</div>
                                    </td>
                                    <td>
                                        <span className="badge contact-made">Contact Made</span>
                                    </td>
                                    <td>
                                        <div className="assignee-cell">
                                            <div className="contact-avatar-placeholder small">👤</div>
                                            <span>{cust.owner?.fullName || 'Unassigned'}</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="last-activity">
                                            <span>{formatActivityDate(cust.interactions && cust.interactions.length > 0 ? cust.interactions[cust.interactions.length - 1].date : cust.createdAt)}</span>
                                            <span className="activity-icons">
                          <span style={{cursor: 'pointer'}} title="Email Customer"
                                onClick={() => handleInteraction(cust, 'Email')}>✉️</span>
                                                {' '}
                                                <a href={`tel:${cust.phone}`}
                                                   style={{cursor: 'pointer', textDecoration: 'none', color: 'inherit'}}
                                                   title="Call Customer"
                                                   onClick={() => handleInteraction(cust, 'Call')}>📞</a>
                        </span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {filteredCustomers.length === 0 && (
                                <tr>
                                    <td colSpan="6"
                                        style={{
                                            textAlign: 'center',
                                            padding: '30px',
                                            color: '#555',
                                            fontFamily: 'Inter'
                                        }}>
                                        No customers found.
                                    </td>
                                </tr>
                            )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {isModalOpen && (
                <AddCustomerModal
                    onClose={() => setIsModalOpen(false)}
                    onAdd={handleCustomerAdded}
                />
            )}

            {emailModalData && (
                <div className="modal-overlay">
                    <EmailComposer
                        customerEmail={emailModalData.email}
                        onClose={() => setEmailModalData(null)}
                        onEmailSent={handleEmailSent}
                    />
                </div>
            )}
        </div>
    );
};

export default Customers;
