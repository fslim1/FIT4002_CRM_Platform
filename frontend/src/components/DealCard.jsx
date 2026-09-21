import "../styles/DealCard.css";

const PRIORITY_STYLES = {
    High: {bg: "#FFF5F5", border: "#FF8181", color: "#FF4444"},
    Medium: {bg: "#FFF8F0", border: "#FFB366", color: "#FF8C00"},
    Low: {bg: "#F0F8FF", border: "#66B3FF", color: "#0066CC"},
};

const RISK_STYLES = {
  High: { stripe: "#EF4444", bg: "#FEF2F2", text: "#B91C1C", label: "High Risk", dot: "#EF4444" },
  Medium: { stripe: "#F59E0B", bg: "#FFFBEB", text: "#B45309", label: "Med Risk", dot: "#F59E0B" },
  Low: { stripe: "#10B981", bg: "#ECFDF5", text: "#047857", label: "Low Risk", dot: "#10B981" },
};

function DealCard({deal, onClick, style, onDragStart}) {
    const priorityStyle = PRIORITY_STYLES[deal.priority] || PRIORITY_STYLES.Medium;

    const rawRisk = deal.riskLevel ?? deal.risk ?? deal.aiRisk ?? deal.dealRisk ?? "";
    const riskLevel = typeof rawRisk === "string" ? rawRisk.trim() : "";
    const normalizedRisk = ["Low", "Medium", "High"].includes(riskLevel)? riskLevel: "";
    const risk = normalizedRisk ? RISK_STYLES[normalizedRisk] : null;

    const handleDragStart = (e) => {
        e.dataTransfer.setData("dealId", deal._id);
        if (onDragStart) onDragStart(e);
    };

    return (
        <div
            className="deal-card"
            draggable
            onDragStart={handleDragStart}
            onClick={onClick}
            style={style}
        >
            <div className="deal-days-badge">
                <span className="deal-days-text">{deal.daysAgo}d</span>
            </div>

            <div className="deal-top-row">
                <span className="deal-name">{deal.name}</span>
                <span className="deal-price">${deal.price}</span>
            </div>

            <div className="deal-company-row">
                <span className="deal-company">{deal.company}</span>

                <div className="deal-badges">
                    <span
                        className="deal-priority-badge"
                        style={{
                            backgroundColor: priorityStyle.bg,
                            border: `0.5px solid ${priorityStyle.border}`,
                            color: priorityStyle.color,
                        }}
                    >
                        {deal.priority}
                    </span>
                        
                    {/* {normalizedRisk && riskStyle && (
                        <span
                            className="deal-risk-badge"
                            title={`${normalizedRisk} Risk`}
                            style={{
                                backgroundColor: riskStyle.bg,
                                border: `1px solid ${riskStyle.border}`,
                                color: riskStyle.color,
                            }}
                        >
                            {riskStyle.letter}
                        </span>
                    )} */}
                </div>
            </div>

            <div className="deal-prob-row">
                <div className="deal-prob-track">
                    <div
                        className="deal-prob-fill"
                        style={{width: `${deal.probability}%`}}
                    />
                </div>
                <span className="deal-prob-text">{deal.probability}%</span>
            </div>

            <div className="deal-divider"/>

            {/* Footer: View action on the left, subtle AI Risk indicator on the right */}
            <div className="deal-footer-row">
                {risk && (
                <div 
                    className="deal-risk-indicator"
                    title={deal.riskReason || `${risk.label}: Calculated based on stage dwell time`}
                    style={{ backgroundColor: risk.bg, color: risk.text }}
                >
                    <span className="deal-risk-dot" style={{ backgroundColor: risk.dot }} />
                    {risk.label}
                </div>
                )}
            </div>
            <div className="deal-view">View</div>
        </div>
    );
}

export default DealCard;