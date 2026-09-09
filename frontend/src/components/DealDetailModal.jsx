import {useState, useEffect, useRef} from "react";
import {useNavigate} from "react-router-dom";
import api from "../services/api";
import {updateDealProbability} from "../api/deals";
import "../styles/DealDetailModal.css";

const STAGE_COLORS = {
    Qualified: "#A4A4A4",
    "Contact Made": "#F5C518",
    "Demo Scheduled": "#4DC9C9",
    "Proposal Made": "#F5A623",
    Negotiation: "#C0392B",
    Won: "#2ECC71",
    Lost: "#7F8C8D",
};

const PRIORITY_STYLES = {
    High: {bg: "#FFF5F5", border: "#FF8181", color: "#FF4444"},
    Medium: {bg: "#FFF8F0", border: "#FFB366", color: "#FF8C00"},
    Low: {bg: "#F0F8FF", border: "#66B3FF", color: "#0066CC"},
};

const timeAgo = (dateString) => {
    if (!dateString) return "No activity yet";
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return `${diffDays} days ago`;
};

const formatDateTime = (dateString) => {
    const d = new Date(dateString);
    return (
        d.toLocaleDateString() +
        ", " +
        d.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})
    );
};

function DealDetailModal({deal, onClose, onDealUpdate}) {
    const navigate = useNavigate();
    const [probability, setProbability] = useState(deal.probability);
    const [customer, setCustomer] = useState(null);
    const [customerLoading, setCustomerLoading] = useState(true);
    const [customerError, setCustomerError] = useState(null);
    const debounceRef = useRef(null);

    useEffect(() => {
        setProbability(deal.probability);
    }, [deal._id, deal.probability]);

    useEffect(() => {
        let cancelled = false;
        const fetchCustomer = async () => {
            if (!deal.customer) {
                setCustomerLoading(false);
                setCustomerError("No customer linked to this deal");
                return;
            }
            try {
                setCustomerLoading(true);
                const res = await api.get("/customers/search", {
                    params: {name: deal.customer},
                });
                if (!cancelled) {
                    setCustomer(res.data);
                    setCustomerError(null);
                }
            } catch (err) {
                if (!cancelled) setCustomerError("Customer profile not found");
            } finally {
                if (!cancelled) setCustomerLoading(false);
            }
        };
        fetchCustomer();
        return () => {
            cancelled = true;
        };
    }, [deal.customer]);

    useEffect(() => {
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, []);

    const handleProbabilityChange = (e) => {
        const value = Number(e.target.value);
        setProbability(value);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(async () => {
            try {
                const updated = await updateDealProbability(deal._id, value);
                onDealUpdate(updated);
            } catch (err) {
                console.error("Failed to update probability", err);
            }
        }, 500);
    };

    const priorityStyle = PRIORITY_STYLES[deal.priority] || PRIORITY_STYLES.Medium;
    const stageColor = STAGE_COLORS[deal.stage] || "#A4A4A4";

    const interactions = customer?.interactions || [];
    const countByType = (type) => interactions.filter((i) => i.type === type).length;
    const lastByType = (type) => {
        const items = interactions
            .filter((i) => i.type === type)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        return items.length > 0 ? items[0].date : null;
    };
    const recentActivity = [...interactions]
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 3);

    const handleViewProfile = () => {
        if (customer?._id) navigate(`/customers/${customer._id}`);
    };

    return (
        <div className="deal-modal-overlay" onClick={onClose}>
            <div className="deal-modal-box" onClick={(e) => e.stopPropagation()}>
                <button className="deal-modal-close" onClick={onClose} aria-label="Close">
                    &times;
                </button>

                <div className="deal-modal-columns">
                    {/* LEFT COLUMN */}
                    <div className="deal-modal-left">
            <span className="deal-modal-created">
              Created: {new Date(deal.createdAt).toLocaleDateString()}
            </span>

                        <div className="deal-modal-title-row">
                            <h2 className="deal-modal-name">{deal.name}</h2>
                            <span className="deal-modal-price">${deal.price}</span>
                        </div>

                        <div className="deal-modal-company-row">
                            <span className="deal-modal-company-icon">🏢</span>
                            <span className="deal-modal-company">{deal.company}</span>
                        </div>

                        <div className="deal-modal-section">
                            <h4 className="deal-modal-label">Stage</h4>
                            <span
                                className="deal-modal-stage-badge"
                                style={{backgroundColor: stageColor}}
                            >
                {deal.stage}
              </span>
                        </div>

                        <div className="deal-modal-section">
                            <h4 className="deal-modal-label">Probability</h4>
                            <div className="deal-modal-prob-row">
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={probability}
                                    onChange={handleProbabilityChange}
                                    className="deal-modal-prob-slider"
                                />
                                <span className="deal-modal-prob-value">{probability}%</span>
                            </div>
                        </div>

                        <div className="deal-modal-grid">
                            <div className="deal-modal-section">
                                <h4 className="deal-modal-label">Assignee</h4>
                                <span className="deal-modal-value">{deal.assignee || "Unassigned"}</span>
                            </div>
                            <div className="deal-modal-section">
                                <h4 className="deal-modal-label">Priority</h4>
                                <span
                                    className="deal-modal-priority-badge"
                                    style={{
                                        backgroundColor: priorityStyle.bg,
                                        border: `0.5px solid ${priorityStyle.border}`,
                                        color: priorityStyle.color,
                                    }}
                                >
                  {deal.priority}
                </span>
                            </div>
                        </div>

                        <div className="deal-modal-section">
                            <h4 className="deal-modal-label">Customer</h4>
                            <div className="deal-modal-customer-row">
                                <span className="deal-modal-value">{deal.customer || "—"}</span>
                                <button
                                    className="deal-modal-view-profile-btn"
                                    onClick={handleViewProfile}
                                    disabled={!customer}
                                >
                                    View Profile
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN */}
                    <div className="deal-modal-right">
                        <h3 className="deal-modal-section-title">Interaction Summary</h3>

                        {customerLoading && <p className="deal-modal-muted">Loading interactions...</p>}
                        {customerError && !customerLoading && (
                            <p className="deal-modal-muted">{customerError}</p>
                        )}

                        {!customerLoading && customer && (
                            <>
                                <div className="deal-modal-stats-grid">
                                    <div className="deal-modal-stat-card">
                                        <span className="deal-modal-stat-title">✉️ Emails</span>
                                        <span className="deal-modal-stat-count">{countByType("Email")}</span>
                                        <span className="deal-modal-stat-meta">
                      Last {timeAgo(lastByType("Email"))}
                    </span>
                                    </div>
                                    <div className="deal-modal-stat-card">
                                        <span className="deal-modal-stat-title">📞 Calls</span>
                                        <span className="deal-modal-stat-count">{countByType("Call")}</span>
                                        <span className="deal-modal-stat-meta">
                      Last {timeAgo(lastByType("Call"))}
                    </span>
                                    </div>
                                    <div className="deal-modal-stat-card">
                                        <span className="deal-modal-stat-title">📝 Tasks</span>
                                        <span className="deal-modal-stat-count">{countByType("Task")}</span>
                                        <span className="deal-modal-stat-meta">
                      Last {timeAgo(lastByType("Task"))}
                    </span>
                                    </div>
                                    <div className="deal-modal-stat-card">
                                        <span className="deal-modal-stat-title">🗒️ Notes</span>
                                        <span className="deal-modal-stat-count">{countByType("Note")}</span>
                                        <span className="deal-modal-stat-meta">
                      Last {timeAgo(lastByType("Note"))}
                    </span>
                                    </div>
                                </div>

                                <h4 className="deal-modal-label" style={{marginTop: "18px"}}>
                                    Recent Activity
                                </h4>
                                <div className="deal-modal-activity-list">
                                    {recentActivity.length === 0 && (
                                        <p className="deal-modal-muted">No activity recorded yet.</p>
                                    )}
                                    {recentActivity.map((item, i) => (
                                        <div className="deal-modal-activity-item" key={item._id || i}>
                      <span
                          className={`deal-modal-activity-type type-${item.type.toLowerCase()}`}
                      >
                        {item.type}
                      </span>
                                            <span className="deal-modal-activity-time">
                        {formatDateTime(item.date)}
                      </span>
                                        </div>
                                    ))}
                                </div>

                                <button className="deal-modal-history-btn" onClick={handleViewProfile}>
                                    View full interaction history
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DealDetailModal;