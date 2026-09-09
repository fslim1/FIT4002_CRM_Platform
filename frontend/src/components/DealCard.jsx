import "../styles/DealCard.css";

const PRIORITY_STYLES = {
    High: {bg: "#FFF5F5", border: "#FF8181", color: "#FF4444"},
    Medium: {bg: "#FFF8F0", border: "#FFB366", color: "#FF8C00"},
    Low: {bg: "#F0F8FF", border: "#66B3FF", color: "#0066CC"},
};

function DealCard({deal, onClick, style, onDragStart}) {
    const priorityStyle = PRIORITY_STYLES[deal.priority] || PRIORITY_STYLES.Medium;

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
            <div className="deal-view">View</div>
        </div>
    );
}

export default DealCard;