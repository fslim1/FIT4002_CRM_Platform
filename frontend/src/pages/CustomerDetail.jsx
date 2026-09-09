import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../services/api';
import './Customers.css';
import AddCustomerModal from '../components/AddCustomerModal';
import EmailComposer from '../components/EmailComposer';
import '../components/EmailComposer.css';

const CustomerDetail = () => {
    const {id} = useParams();
    const [customer, setCustomer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const fileInputRef = useRef(null);

    const fetchCustomer = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);
            const res = await api.get(`/customers/${id}`);
            setCustomer(res.data);
            if (showLoading) setError(null);
        } catch (err) {
            console.error(err);
            if (showLoading) setError('Failed to fetch customer details.');
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        fetchCustomer();
    }, [id]);

    const handleCustomerUpdated = () => {
        fetchCustomer(false);
    };

    const handleInteraction = async (type) => {
        if (type === 'Email') {
            setIsEmailModalOpen(true);
            return;
        }

        try {
            await api.post(`/customers/${id}/interactions`, {
                type: type,
                details: `Initiated ${type} contact from Customer Profile`
            });

            fetchCustomer(false); // Silent refresh
        } catch (err) {
            console.error(`Failed to log ${type} interaction`, err);
        }
    };

    const handleEmailSent = async (data) => {
        try {
            await api.post(`/customers/${id}/interactions`, {
                type: 'Email',
                details: `Sent Email - Subject: ${data.desc}`
            });
            fetchCustomer(false);
        } catch (err) {
            console.error("Failed to log email interaction", err);
        }
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 10000000) {
            setUploadError("File size exceeds 10MB limit.");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);

        try {
            setUploading(true);
            setUploadError(null);
            await api.post(`/customers/${id}/files`, formData, {
                headers: {'Content-Type': 'multipart/form-data'}
            });
            fetchCustomer();
        } catch (err) {
            console.error(err);
            setUploadError(err.response?.data?.message || 'Failed to upload file.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const formatSize = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const getMergedTimeline = () => {
        if (!customer) return [];
        let events = [];
        if (customer.attachments) {
            events = events.concat(customer.attachments.map(a => ({
                id: a._id,
                date: new Date(a.uploadedAt),
                content: `Uploaded document: ${a.originalName}`,
                icon: '📄'
            })));
        }
        if (customer.interactions) {
            events = events.concat(customer.interactions.map(i => ({
                id: i._id,
                date: new Date(i.date),
                content: `Logged ${i.type}: ${i.details}`,
                icon: i.type === 'Email' ? '✉️' : (i.type === 'Call' ? '📞' : '📝')
            })));
        }
        events.push({
            id: 'creation',
            date: new Date(customer.createdAt),
            content: 'Added to the system.',
            icon: '👤'
        });

        events.sort((a, b) => b.date - a.date);
        return events;
    };

    if (loading) return <div className="loading-msg">Loading...</div>;
    if (error) return <div className="error-msg">{error}</div>;
    if (!customer) return <div className="error-msg">Customer not found.</div>;

    const timelineEvents = getMergedTimeline();

    return (
        <div className="customer-detail-page">
            <div className="customer-detail-header"
                 style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px'}}>
                <div>
                    <Link to="/customers" className="back-link">← Back to Customers</Link>
                    <h1 style={{marginTop: '10px'}}>Customer Profile</h1>
                </div>
                <button className="add-contact-btn" onClick={() => setIsEditModalOpen(true)}>
                    Edit Customer
                </button>
            </div>

            <div className="customer-profile-container">
                <div className="profile-sidebar">
                    {customer.companyLogo ? (
                        <img src={`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}${customer.companyLogo}`}
                             alt={`${customer.company} logo`} className="profile-logo"/>
                    ) : (
                        <div className="profile-logo-placeholder">🏢</div>
                    )}
                    <h2>{customer.fullName}</h2>
                    <p className="profile-designation">{customer.designation}</p>
                    <p className="profile-company">{customer.company}</p>

                    <div className="profile-contact-info">
                        <p><strong>Email:</strong> {customer.email}</p>
                        <p><strong>Phone:</strong> {customer.phone}</p>
                        <p><strong>Department:</strong> {customer.department}</p>
                        <p><strong>Address:</strong> {customer.address}</p>
                    </div>

                    <div className="profile-actions" style={{marginTop: '20px', display: 'flex', gap: '10px'}}>
                        <button className="add-contact-btn" onClick={() => handleInteraction('Email')}
                                style={{flex: 1, textAlign: 'center', color: '#fff'}}>✉️ Email
                        </button>
                        <a className="add-contact-btn" href={`tel:${customer.phone}`}
                           onClick={() => handleInteraction('Call')}
                           style={{flex: 1, textDecoration: 'none', textAlign: 'center', color: '#fff'}}>📞 Call</a>
                    </div>
                </div>

                <div className="profile-main-content">
                    <div className="timeline-section">
                        <h3>Interaction Timeline</h3>
                        <div className="timeline-placeholder">
                            {timelineEvents.map((event) => (
                                <div className="timeline-item" key={`timeline-${event.id}`}>
                                    <span className="timeline-date">{event.date.toLocaleString()}</span>
                                    <p>{event.icon} <strong>{event.content}</strong></p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="files-section">
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            marginBottom: '15px'
                        }}>
                            <h3 style={{margin: 0}}>Files & Documents</h3>
                            <div>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                    style={{display: 'none'}}
                                    accept=".pdf,.doc,.docx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp"
                                />
                                <button className="add-contact-btn" onClick={() => fileInputRef.current.click()}
                                        disabled={uploading}>
                                    {uploading ? 'Uploading...' : 'Upload File'}
                                </button>
                            </div>
                        </div>

                        {uploadError && <p className="error-msg">{uploadError}</p>}

                        <div className="files-list">
                            {customer.attachments && customer.attachments.length > 0 ? (
                                customer.attachments.map(file => (
                                    <div className="file-item" key={file._id}>
                                        <div className="file-info">
                                            <span className="file-icon">📄</span>
                                            <div>
                                                <strong>{file.originalName}</strong>
                                                <div className="file-meta">
                                                    {formatSize(file.size)} • {new Date(file.uploadedAt).toLocaleDateString()}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="file-actions">
                                            <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/customers/${customer._id}/files/${file._id}/view`}
                                               target="_blank" rel="noopener noreferrer" className="btn-link">Open</a>
                                            <a href={`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/api/customers/${customer._id}/files/${file._id}/download`}
                                               className="btn-link">Download</a>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <p style={{color: '#777', fontStyle: 'italic'}}>No files attached yet.</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {isEditModalOpen && (
                <AddCustomerModal
                    onClose={() => setIsEditModalOpen(false)}
                    onAdd={handleCustomerUpdated}
                    initialData={customer}
                />
            )}

            {isEmailModalOpen && (
                <div className="modal-overlay">
                    <EmailComposer
                        customerEmail={customer.email}
                        onClose={() => setIsEmailModalOpen(false)}
                        onEmailSent={handleEmailSent}
                    />
                </div>
            )}
        </div>
    );
};

export default CustomerDetail;
