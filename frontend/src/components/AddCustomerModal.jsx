import { useState, useEffect, useRef } from 'react';
import api from '../services/api';

const AddCustomerModal = ({ onClose, onAdd, initialData = null }) => {
    const [formData, setFormData] = useState(() => ({
        fullName: initialData?.fullName || '',
        email: initialData?.email || '',
        phone: initialData?.phone || '',
        company: initialData?.company || '',
        designation: initialData?.designation || '',
        department: initialData?.department || '',
        address: initialData?.address || 'Not Provided'
    }));
    const [logoFile, setLogoFile] = useState(null);
    const [previewUrl, setPreviewUrl] = useState(() =>
        initialData?.companyLogo
            ? `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}${initialData.companyLogo}`
            : null
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const fileInputRef = useRef(null);

    const handleChange = (e) => {
        setFormData({...formData, [e.target.name]: e.target.value});
    };

    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                setError('Company logo must be an image.');
                return;
            }
            setLogoFile(file);
            setPreviewUrl(URL.createObjectURL(file));
            setError('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        // Basic validation
        if (!formData.fullName || !formData.email || !formData.phone || !formData.company || !formData.designation || !formData.department) {
            setError('Please fill in all fields.');
            setLoading(false);
            return;
        }

        const data = new FormData();
        data.append('fullName', formData.fullName);
        data.append('email', formData.email);
        data.append('phone', formData.phone);
        data.append('company', formData.company);
        data.append('designation', formData.designation);
        data.append('department', formData.department);
        data.append('address', formData.address);

        if (logoFile) {
            data.append('companyLogo', logoFile);
        }

        try {
            if (initialData) {
                await api.put(`/customers/${initialData._id}`, data, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                });
            } else {
                await api.post('/customers', data, {
                    headers: {
                        'Content-Type': 'multipart/form-data',
                    },
                });
            }
            onAdd();
            onClose();
        } catch (err) {
            console.error('Error saving customer:', err);
            setError(err.response?.data?.message || 'Failed to save customer');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay">
            <div className="modal-content">
                <h2>{initialData ? 'Edit Contact' : 'Add Contact'}</h2>
                {error && <p className="error-msg">{error}</p>}

                <form onSubmit={handleSubmit} className="add-contact-form">
                    <div className="form-left">
                        <div className="form-group">
                            <label>Full Name</label>
                            <input type="text" name="fullName" value={formData.fullName} onChange={handleChange}
                                   placeholder="John Smith"/>
                        </div>
                        <div className="form-group">
                            <label>Email Address</label>
                            <input type="email" name="email" value={formData.email} onChange={handleChange}
                                   placeholder="john@greenwatts.com"/>
                        </div>
                        <div className="form-group">
                            <label>Phone Number</label>
                            <input type="text" name="phone" value={formData.phone} onChange={handleChange}
                                   placeholder="16376522976"/>
                        </div>
                        <div className="form-group">
                            <label>Address</label>
                            <input type="text" name="address"
                                   value={formData.address === 'Not Provided' ? '' : formData.address}
                                   onChange={handleChange} placeholder="123 Main St"/>
                        </div>
                        <div className="form-group assignee-group">
                            <label>Assignee</label>
                            <div className="assignee-display">
                                <span className="contact-avatar-placeholder small">👤</span>
                                <span>You</span>
                            </div>
                        </div>
                    </div>

                    <div className="form-middle">
                        <div className="form-group">
                            <label>Company</label>
                            <input type="text" name="company" value={formData.company} onChange={handleChange}
                                   placeholder="GreenWatts Ltd"/>
                        </div>
                        <div className="form-group">
                            <label>Designation</label>
                            <input type="text" name="designation" value={formData.designation} onChange={handleChange}
                                   placeholder="Procurement Mgr"/>
                        </div>
                        <div className="form-group">
                            <label>Department</label>
                            <input type="text" name="department" value={formData.department} onChange={handleChange}
                                   placeholder="Management"/>
                        </div>

                        <div className="upload-btn-wrapper">
                            <button type="button" className="upload-logo-btn"
                                    onClick={() => fileInputRef.current.click()}>
                                <span>↪</span> Upload company logo
                            </button>
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileChange}
                                accept="image/*"
                                style={{display: 'none'}}
                            />
                        </div>
                    </div>

                    <div className="form-right">
                        <div className="logo-preview-box">
                            {previewUrl ? (
                                <img src={previewUrl} alt="Logo Preview" className="logo-preview-img"/>
                            ) : (
                                <span className="logo-placeholder-text">Company logo</span>
                            )}
                        </div>
                        <button type="submit" className="add-btn" disabled={loading}>
                            {loading ? 'Saving...' : (initialData ? 'Save' : 'Add')}
                        </button>
                        <button type="button" className="cancel-btn" onClick={onClose}>
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddCustomerModal;
