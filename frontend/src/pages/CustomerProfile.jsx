import {useState, useEffect} from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '@/context/auth';
import {can} from '@/lib/permissions';
import '../styles/CustomerProfile.css';
import '../styles/InteractionSidePanel.css'
import AddCustomerModal from '../components/AddCustomerModal';
import EmailComposer from '../components/EmailComposer.jsx';
import {
    FiArrowRight,
    FiEdit2,
    FiEdit3,
    FiFolder,
    FiList,
    FiMail,
    FiPhone,
    FiSearch,
    FiUpload,
    FiUser,
    FiX,
    FiTrash2
} from "react-icons/fi";
import {FaWhatsapp} from "react-icons/fa";
import {generateWhatsAppUrl} from '../lib/phoneUtils';

const ProfileLogo = ({companyLogo, companyName}) => {
    const [imgError, setImgError] = useState(false);

    const imageUrl = companyLogo ? `${import.meta.env.VITE_API_URL || 'http://localhost:5001'}${companyLogo}` : null;

    if (imageUrl && !imgError) {
        return (
            <img
                src={imageUrl}
                alt={`${companyName || 'Company'} logo`}
                className="profile-logo"
                onError={() => setImgError(true)}
            />
        );
    }

    const initials = companyName
        ? companyName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
        : null;

    return initials ? (
        <div className="profile-logo-placeholder-initials">{initials}</div>
    ) : (
        <FiUser className="avatar-icon"/>
    );
};

function CustomerProfile() {
    const {id} = useParams();
    const navigate = useNavigate();
    const {user} = useAuth();
    // Delete options render only for Admins or people granted the matching
    // permission in Settings -> Permissions
    const canDeleteCustomer = can(user, 'deleteCustomers');
    const canDeleteRecords = can(user, 'deleteRecords');
    const [customer, setCustomer] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    // State to track active tab
    const [activeTab, setActiveTab] = useState('Interactions');
    const [searchQuery, setSearchQuery] = useState("");

    // State for the Detail Modal
    const [selectedInteraction, setSelectedInteraction] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editedData, setEditedData] = useState({});

    const [isComposingEmail, setIsComposingEmail] = useState(false);
    // State for the Log Interaction Modal
    const [isLoggingModalOpen, setIsLoggingModalOpen] = useState(false);
    const [newInteractionData, setNewInteractionData] = useState({type: 'Note', desc: ''});

    const [allInteractions, setAllInteractions] = useState([]);
    const [visibleCount, setVisibleCount] = useState(5);

    const [documents, setDocuments] = useState([]);

    //GET Request: Load timeline from MongoDB using Axios instance
    const mapBackendInteractionToMyUI = (interaction) => ({
        _id: interaction._id,
        type: interaction.type,
        desc: interaction.details || interaction.desc || "",
        author: interaction.author || "",
        createdAt: interaction.date || interaction.createdAt,
        time: interaction.date || interaction.createdAt,
    });

    const mapBackendAttachmentToMyUI = (attachment) => ({
        _id: attachment._id,
        originalName: attachment.originalName,
        fileName: attachment.filename || attachment.fileName,
        filePath: attachment.path || attachment.filePath,
        fileSize: attachment.size || attachment.fileSize,
        createdAt: attachment.uploadedAt || attachment.createdAt,
    });

    const fetchCustomer = async (showLoading = true) => {
        try {
            if (showLoading) setLoading(true);

            const res = await api.get(`/customers/${id}`);

            const customerData = res.data;
            setCustomer(customerData);

            setAllInteractions(
                (customerData.interactions || []).map(mapBackendInteractionToMyUI)
                    .sort((a, b) => new Date(b.time) - new Date(a.time))
            );

            setDocuments(
                (customerData.attachments || []).map(mapBackendAttachmentToMyUI)
            );

            setError(null);
        } catch (err) {
            console.error("Failed to fetch customer details:", err);
            setError("Failed to fetch customer details.");
        } finally {
            if (showLoading) setLoading(false);
        }
    };

    useEffect(() => {
        if (id) fetchCustomer();
    }, [id]);

    // Helper to dynamically match raw text types to frontend style elements
    const getStyleConfig = (type) => {
        switch (type) {
            case 'Email':
                return {
                    icon: <FiMail/>,
                    className: 'icon-email',
                    typeClass: 'type-email'
                };
            case 'Task':
                return {
                    icon: <FiList/>,
                    className: 'icon-task',
                    typeClass: 'type-task'
                };
            case 'Call':
                return {
                    icon: <FiPhone/>,
                    className: 'icon-call',
                    typeClass: 'type-call'
                };
            case 'Note':
                return {
                    icon: <FiEdit3/>,
                    className: 'icon-note',
                    typeClass: 'type-note'
                };
            case 'Stage Change':
            default:
                return {
                    icon: <FiFolder/>,
                    className: 'icon-stage',
                    typeClass: 'type-stage'
                };
        }
    };


    const handleCustomerUpdated = () => {
        fetchCustomer(false);
    };

    // Deleting a customer profile needs the Delete Customers permission
    const handleDeleteCustomer = async () => {
        if (!window.confirm(`Permanently delete ${customer.fullName}'s profile? This cannot be undone.`)) {
            return;
        }
        try {
            await api.delete(`/customers/${id}`);
            navigate('/customers');
        } catch (err) {
            console.error("Failed to delete customer:", err);
            alert(err.response?.data?.message || "Failed to delete customer.");
        }
    };

    // Logic to delete an interaction
    const handleDelete = async () => {
        if (window.confirm("Are you sure you want to delete this log?")) {

            try {
                const res = await api.delete(`/customers/${id}/interactions/${selectedInteraction._id}`);
                if (res.data.status === "success") {
                    setAllInteractions((prev) =>
                        prev.filter((interaction) => interaction._id !== selectedInteraction._id)
                    );
                    setSelectedInteraction(null);
                }
            } catch (err) {
                console.error("Failed to delete interaction:", err);
                alert("Failed to delete interaction.");
            }
        }
    };

    const handleEditClick = () => {
        setEditedData(selectedInteraction);
        setIsEditing(true);
    };

    const handleInputChange = (e) => {
        const {name, value} = e.target;
        setEditedData({...editedData, [name]: value});
    };

    // 3. Save changes back to the main list
    const handleSave = async () => {

        try {
            const res = await api.put(`/customers/${id}/interactions/${selectedInteraction._id}`, {
                type: editedData.type,
                desc: editedData.desc,
            });

            if (res.data.status === "success") {
                setAllInteractions((prev) =>
                    prev.map((interaction) =>
                        interaction._id === res.data.data._id ? res.data.data : interaction
                    )
                );

                setSelectedInteraction(res.data.data);
                setIsEditing(false);
            }
        } catch (err) {
            console.error("Failed to update interaction:", err);
            alert("Failed to update interaction.");
        }
    }

    const handleCancel = () => {
        setIsEditing(false);
    };

    // Logic for adding a new interaction
    const handleOpenLogModal = () => {
        let defaultType = 'Note';
        if (['Emails', 'Calls', 'Tasks', 'Notes'].includes(activeTab)) {
            const mapping = {
                'Emails': 'Email',
                'Calls': 'Call',
                'Tasks': 'Task',
                'Notes': 'Note'
            };
            defaultType = mapping[activeTab];
        }
        setNewInteractionData({type: defaultType, desc: ''});
        setIsLoggingModalOpen(true);
    };

    const handleCloseLogModal = () => {
        setIsLoggingModalOpen(false);
    };

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];

        if (!file) return;

        if (file.size > 10000000) {
            setUploadError("File size exceeds 10MB limit.");
            e.target.value = "";
            return;
        }

        const formData = new FormData();
        formData.append("file", file);

        try {
            setUploading(true);
            setUploadError(null);

            await api.post(`/customers/${id}/files`, formData, {
                headers: {
                    "Content-Type": "multipart/form-data",
                },
            });

            await fetchCustomer(false);
        } catch (err) {
            console.error("Failed to upload file:", err);
            setUploadError(err.response?.data?.message || "Failed to upload file.");
        } finally {
            setUploading(false);
            e.target.value = "";
        }
    };

    const handleDeleteDocument = async (documentId) => {
        const confirmDelete = window.confirm("Delete this file?");
        if (!confirmDelete) return;

        try {
            await api.delete(`/customers/${id}/files/${documentId}`);
            setDocuments((prev) => prev.filter((doc) => doc._id !== documentId));
            await fetchCustomer(false);
        } catch (err) {
            console.error("Failed to delete file:", err);
            alert("Failed to delete file.");
        }
    };

    const handleNewInteractionChange = (e) => {
        const {name, value} = e.target;
        setNewInteractionData({...newInteractionData, [name]: value});
    };

    const handleSaveNewInteraction = async () => {

        const payload = {
            type: newInteractionData.type || "Note",
            details: newInteractionData.desc,
            priority: newInteractionData.priority || "Medium",
            dueDate: newInteractionData.dueDate || null,
            companyName: customer?.company
        };

        try {
            // 4. Hit the exact same Express endpoint to store it in MongoDB
            await api.post(`/customers/${id}/interactions`, payload);

            await fetchCustomer(false);

            setIsLoggingModalOpen(false);
            setNewInteractionData({type: 'Note', desc: '', priority: 'Medium', dueDate: ''});
        } catch (err) {
            console.error("Failed to save new manual interaction to database:", err);
            console.error("Backend response:", err.response?.data);
            console.error("Status:", err.response?.status);
            alert(err.response?.data?.message || "Server error: Could not save interaction.");
        }
    };

    /**
     * Opens the customer's WhatsApp conversation in a new tab so the
     * salesperson can press the voice-call icon inside WhatsApp.
     *
     * NOTE: A standard wa.me link cannot initiate or confirm a voice call
     * automatically. The salesperson must press the call icon manually.
     */
    const handleWhatsAppCall = async () => {
        const url = generateWhatsAppUrl(customer.phone);

        if (!url) {
            alert("No valid WhatsApp number is available for this customer.");
            return;
        }

        // Open WhatsApp Web / app in a new tab with security attributes
        window.open(url, "_blank", "noopener,noreferrer");

        // Log the interaction as "Call — WhatsApp initiated".
        // Fire-and-forget: WhatsApp has already opened above, so a logging
        // failure must never prevent the salesperson from reaching the customer.
        try {
            await api.post(`/customers/${id}/interactions`, {
                type: "Call",
                details: "WhatsApp opened for customer call",
            });
            fetchCustomer(false);
        } catch (err) {
            console.error("Failed to log WhatsApp call interaction", err);
        }
    };

    const formatInteractionTime = (dateString) => {
        const date = new Date(dateString);
        const now = new Date();

        const time = date.toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
            hour12: true,
        }).toLowerCase();

        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const interactionDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

        const diffDays = Math.floor((today - interactionDate) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
            return `Today ${time}`;
        }

        if (diffDays === 1) {
            return `Yesterday ${time}`;
        }

        return `${date.getDate()}/${date.getMonth() + 1} ${time}`;
    };

    //Logic to filter interactions based on tab
    const filteredInteractions = allInteractions.filter((item) => {
        // Map plural tab names to singular types
        const tabMapping = {
            'Emails': 'Email',
            'Calls': 'Call',
            'Tasks': 'Task',
            'Notes': 'Note'
        };

        const matchesTab =
            activeTab === "Interactions" || item.type === tabMapping[activeTab];

        const query = searchQuery.toLowerCase().trim();

        const matchesSearch =
            query === "" ||
            item.type?.toLowerCase().includes(query) ||
            item.desc?.toLowerCase().includes(query) ||
            item.author?.toLowerCase().includes(query);

        // return item.type === tabMapping[activeTab];
        return matchesTab && matchesSearch;
    });

    const visibleInteractions = filteredInteractions.slice(0, visibleCount);
    const hasMoreInteractions = visibleCount < filteredInteractions.length;

    // Calculate dynamic stats
    const emailCount = allInteractions.filter(i => i.type === 'Email').length;
    const callCount = allInteractions.filter(i => i.type === 'Call').length;
    const taskCount = allInteractions.filter(i => i.type === 'Task').length;

    const totalInteractions = allInteractions.length;
    let engagementLevel = 'Low';
    let engagementClass = 'engagement-low';
    if (totalInteractions >= 5) {
        engagementLevel = 'High';
        engagementClass = 'engagement-high';
    } else if (totalInteractions >= 3) {
        engagementLevel = 'Medium';
        engagementClass = 'engagement-medium';
    }

    // Ensure recentInteractionTime is based on the first element (most recent)
    const recentInteractionTime = allInteractions.length > 0 ? allInteractions[0].time : 'No recent activity';

    if (loading) return <div className="loading-msg">Loading...</div>;
    if (error) return <div className="error-msg">{error}</div>;
    if (!customer) return <div className="error-msg">Customer not found.</div>;

    return (
        <div className="customer-detail-page">
            <div className="customer-detail-header">
                <div>
                    <Link to="/customers" className="back-link">← Back to Customers</Link>
                    <h1>Customer Profile</h1>
                </div>
            </div>

            <div className="customer-profile-container">

                {/* LEFT COLUMN */}
                <div className="left-column">
                    {/* Profile Card */}
                    <div className="profile-card">
                        <ProfileLogo key={customer.companyLogo || ''} companyLogo={customer.companyLogo}
                                     companyName={customer.company}/>
                        <h2 className="profile-name">{customer.fullName}</h2>
                        <p className="profile-subtitle">
                            {customer.designation} ·<br/>
                            {customer.company}
                        </p>

                        <div className="about-account">
                            <h3>About account</h3>

                            <div className="info-group">
                                <span className="info-label">Email</span>
                                <span className="info-value email-link">{customer.email}</span>
                            </div>

                            <div className="info-group">
                                <span className="info-label">Phone</span>
                                <span className="info-value">{customer.phone}</span>
                            </div>

                            <div className="info-group">
                                <span className="info-label">Company</span>
                                <span className="info-value">{customer.company}</span>
                            </div>

                            <div className="info-group">
                                <span className="info-label">Department</span>
                                <span className="info-value">{customer.department}</span>
                            </div>

                            <div className="info-group">
                                <span className="info-label">Created</span>
                                <span className="info-value">{new Date(customer.createdAt).toLocaleDateString()}</span>
                            </div>

                            <div className="profile-actions">
                                <button className="add-contact-btn" onClick={() => setIsComposingEmail(true)}>✉️ Email
                                </button>
                                <button
                                    className="add-contact-btn call-btn"
                                    onClick={handleWhatsAppCall}
                                    disabled={!generateWhatsAppUrl(customer.phone)}
                                    title="Open customer in WhatsApp to call"
                                    aria-label="Open customer in WhatsApp to call"
                                >
                                    <FaWhatsapp/> Call
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Linked Deals Card */}
                    <div className="linked-deals-card">
                        <h3>Linked Deals</h3>

                        <div className="deal-item">
                            <div className="deal-info">
                                <span className="deal-title">Solar grid expansion</span>
                                <span className="deal-amount">$48,000</span>
                                <span className="deal-status status-proposal">Proposal Made</span>
                            </div>
                            <button className="deal-arrow-btn" aria-label="View solar grid expansion deal">
                                <FiArrowRight/>
                            </button>
                        </div>

                        <div className="deal-item">
                            <div className="deal-info">
                                <span className="deal-title">EV charging pilot</span>
                                <span className="deal-amount">$12,000</span>
                                <span className="deal-status status-won">Won</span>
                            </div>
                            <button className="deal-arrow-btn" aria-label="View EV charging pilot deal">
                                <FiArrowRight/>
                            </button>
                        </div>
                    </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="right-column">
                    {/* Top Header / Activity Summary */}
                    <div className="activity-header-area">
                        <div className="activity-summary-card">
                            <h3>Activity Summary</h3>
                            <div className="activity-pills">
                                <div className="summary-pill pill-emails">
                                    <span className="pill-count">{emailCount}</span>
                                    <span className="pill-label">Emails</span>
                                </div>
                                <div className="summary-pill pill-calls">
                                    <span className="pill-count">{callCount}</span>
                                    <span className="pill-label">Calls</span>
                                </div>
                                <div className="summary-pill pill-tasks">
                                    <span className="pill-count">{taskCount}</span>
                                    <span className="pill-label">Tasks</span>
                                </div>
                            </div>

                            <div className="engagement-insights">
                                <div className="insight-row">
                                    <span className="insight-label">Engagement:</span>
                                    <span className={`insight-badge ${engagementClass}`}>{engagementLevel}</span>
                                </div>
                                <div className="insight-row">
                                    <span className="insight-label">Last Active:</span>
                                    <span
                                        className="insight-value">{formatInteractionTime(recentInteractionTime)}</span>
                                </div>
                            </div>
                        </div>

                        <div className="header-actions">
                            <div className="search-bar">
                                <input
                                    type="text"
                                    placeholder="Search interactions, notes, email and more..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                                <FiSearch className="search-icon"/>
                            </div>
                            <button className="edit-profile-btn" onClick={() => setIsEditModalOpen(true)}>
                                <FiEdit2 className="edit-icon"/>
                                Edit Profile
                            </button>
                            {canDeleteCustomer && (
                                <button
                                    className="edit-profile-btn delete-customer-btn"
                                    onClick={handleDeleteCustomer}
                                    title="Requires the Delete Customers permission"
                                >
                                    <FiTrash2 className="edit-icon"/>
                                    Delete
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="tabs-container">
                        {['Interactions', 'Emails', 'Calls', 'Tasks', 'Files', 'Notes'].map((name) => (
                            <button
                                key={name}
                                className={`tab ${activeTab === name ? 'active-tab' : ''}`}
                                onClick={() => {
                                    setActiveTab(name)
                                    setSelectedInteraction(null);
                                    setIsEditing(false);
                                }}
                            >
                                {name}
                            </button>
                        ))}
                    </div>

                    {/* Interactions List */}
                    {activeTab !== 'Files' && (
                        <div className="interactions-card">
                            <div className="interactions-header">
                                <h3>{activeTab === 'Interactions' ? 'All Interactions' : activeTab}</h3>
                                <div className="interaction-action-btns">
                                    {activeTab !== 'Notes' && (
                                        <button className="log-interaction-btn"
                                                onClick={() => setIsComposingEmail(true)}>
                                            <FiMail/> Send Email
                                        </button>
                                    )}
                                    <button className="log-interaction-btn" onClick={handleOpenLogModal}>+ Log
                                        Interaction
                                    </button>
                                </div>
                            </div>

                            <div className="interactions-content-layout">

                                <div className="interactions-list">
                                    {visibleInteractions.map((item) => {

                                        const config = getStyleConfig(item.type);

                                        const itemId = item._id || item.id;

                                        return (
                                            <div
                                                className={`interaction-item clickable ${selectedInteraction?.id === itemId ? 'active-item' : ''}`}
                                                key={item.id}
                                                onClick={() => setSelectedInteraction(item)} // 4. CLICK TO OPEN MODAL
                                            >
                                                {/* Uses the generated icon background wrapper style */}
                                                <div className={`interaction-icon-wrapper ${config.className}`}>
                                                    {config.icon}
                                                </div>

                                                <div className="interaction-content">
                                                    <div className="interaction-meta">
                                                        <span
                                                            className={`interaction-type ${config.typeClass}`}>{item.type}</span>
                                                        <span className="interaction-author">by {item.author}</span>
                                                    </div>
                                                    <p className="interaction-desc">{item.desc}</p>
                                                </div>
                                                <div
                                                    className="interaction-time">{formatInteractionTime(item.time)}</div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {isEditModalOpen && (
                                    <AddCustomerModal
                                        onClose={() => setIsEditModalOpen(false)}
                                        onAdd={handleCustomerUpdated}
                                        initialData={customer}
                                    />
                                )}
                                {/* SHOW EITHER DETAIL VIEW OR EMAIL COMPOSER */}
                                {isComposingEmail ? (
                                    <EmailComposer
                                        customerEmail={customer.email}
                                        customerId={customer?._id || customer?.id || id}
                                        onClose={() => setIsComposingEmail(false)}
                                        onEmailSent={async () => {
                                          try {
                                              await fetchCustomer(false);
                                          } catch (err) {
                                              console.error("Failed to refresh customer data:", err);
                                          } finally {
                                              setIsComposingEmail(false);
                                          }
                                      }}
                                    />
                                ) : selectedInteraction && (
                                    <div className="side-panel">
                                        <div className="side-panel-header">
                                            <h4>{isEditing ? 'Edit Interaction' : 'Detail View'}</h4>
                                            <button onClick={() => {
                                                setSelectedInteraction(null);
                                                setIsEditing(false);
                                            }} className="close-btn"><FiX/></button>
                                        </div>

                                        <div className="side-panel-body">
                                            <div className="side-panel-row">
                                                <strong>Activity:</strong>
                                                {isEditing ? (
                                                    <select name="type" className="edit-select" value={editedData.type}
                                                            onChange={handleInputChange}>
                                                        <option value="Email">Email</option>
                                                        <option value="Call">Call</option>
                                                        <option value="Task">Task</option>
                                                        <option value="Note">Note</option>
                                                    </select>
                                                ) : (
                                                    <span>{selectedInteraction.type}</span>
                                                )}
                                            </div>

                                            <div className="side-panel-row">
                                                <strong>Owner:</strong> <span>{selectedInteraction.author}</span>
                                            </div>
                                            <div className="side-panel-row">
                                                <strong>Logged:</strong>
                                                <span>{formatInteractionTime(selectedInteraction.time)}</span>
                                            </div>
                                            <div className="side-panel-notes">
                                                <strong>Notes:</strong>
                                                {isEditing ? (
                                                    <textarea
                                                        name="desc"
                                                        value={editedData.desc}
                                                        onChange={handleInputChange}
                                                        className="edit-textarea"
                                                    />
                                                ) : (
                                                    <p className="detail-notes-text">{selectedInteraction.desc}</p>
                                                )}
                                            </div>
                                        </div>

                                        <div className="side-panel-footer">
                                            {isEditing ? (
                                                <>
                                                    <button className="cancel-btn" onClick={handleCancel}>Cancel
                                                    </button>
                                                    <button className="save-btn" onClick={handleSave}>Save Changes
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    {/* Needs the Delete Records permission */}
                                                    {canDeleteRecords && (
                                                        <button className="delete-btn-action" onClick={handleDelete}>
                                                            <FiTrash2/> Delete
                                                        </button>
                                                    )}
                                                    <button className="edit-btn-action" onClick={handleEditClick}>
                                                        <FiEdit2/> Edit
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {filteredInteractions.length > 5 && (
                                <button
                                    className="view-more-btn"
                                    onClick={() => {
                                        if (hasMoreInteractions) {
                                            setVisibleCount((prev) => prev + 5);
                                        } else {
                                            setVisibleCount(5);
                                        }
                                    }}
                                >
                                    {hasMoreInteractions ? "View more" : "View less"}
                                </button>
                            )}
                        </div>
                    )}


                    {/* Files & Documents */}
                    {!['Emails', 'Notes', 'Calls', 'Tasks'].includes(activeTab) && (
                        <div className="files-card">
                            <div className="files-header">
                                <h3>Files & Documents</h3>
                                <label className="upload-btn">
                                <FiUpload />
                                Upload
                                <input type="file" hidden onChange={handleFileUpload} />
                              </label>
                            </div>

                            <div className="files-list">
                                {documents.length === 0 ? (
                                    <p className="empty-state">No documents uploaded yet.</p>
                                ) : (
                                    documents.map((doc) => (
                                        <div className="file-item" key={doc._id}>
                                            <div className="file-info">
                                                <span className="file-name">{doc.originalName}</span>

                                                <span className="file-meta">
                                                    Uploaded {formatInteractionTime(doc.createdAt)} -{" "}
                                                    {(doc.fileSize / 1024 / 1024).toFixed(1)} MB
                                                </span>
                                            </div>

                                            <div className="file-actions">
                                                <a
                                                    href={`${import.meta.env.VITE_API_URL || "http://localhost:5001"}/api/customers/${customer._id}/files/${doc._id}/download`}
                                                    className="download-btn"
                                                >
                                                    Download
                                                </a>

                                                {/* Needs the Delete Records permission */}
                                                {canDeleteRecords && (
                                                    <button
                                                        type="button"
                                                        className="delete-btn-action"
                                                        onClick={() => handleDeleteDocument(doc._id)}
                                                    >
                                                        <FiTrash2/>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* LOG INTERACTION MODAL */}
            {isLoggingModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content-card">
                        <div className="modal-header">
                            <h3>Log Interaction</h3>
                            <button onClick={handleCloseLogModal} className="close-btn"><FiX/></button>
                        </div>

                        <div className="modal-body">

                            <div className="form-group">
                                <label>Description / Notes</label>
                                <textarea
                                    name="desc"
                                    value={newInteractionData.desc}
                                    onChange={handleNewInteractionChange}
                                    className="edit-textarea"
                                    placeholder="Enter details about this interaction..."
                                />
                            </div>

                            {newInteractionData.type === 'Task' && (
                                <div className="task-extra-fields"
                                     style={{marginTop: '15px', display: 'flex', gap: '15px'}}>

                                    <div className="form-group" style={{flex: 1}}>
                                        <label>Priority</label>
                                        <select
                                            className="form-control"
                                            value={newInteractionData.priority || 'Medium'}
                                            onChange={(e) => setNewInteractionData({
                                                ...newInteractionData,
                                                priority: e.target.value
                                            })}
                                        >
                                            <option value="Low">Low</option>
                                            <option value="Medium">Medium</option>
                                            <option value="High">High</option>
                                        </select>
                                    </div>

                                    <div className="form-group" style={{flex: 1}}>
                                        <label>Due Date</label>
                                        <input
                                            type="date"
                                            className="form-control"
                                            value={newInteractionData.dueDate || ''}
                                            onChange={(e) => setNewInteractionData({
                                                ...newInteractionData,
                                                dueDate: e.target.value
                                            })}
                                        />
                                    </div>

                                </div>
                            )}
                        </div>

                        <div className="modal-footer">
                            <button className="cancel-btn" onClick={handleCloseLogModal}>Cancel</button>
                            <button className="save-btn" onClick={handleSaveNewInteraction}>Save Interaction</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default CustomerProfile;