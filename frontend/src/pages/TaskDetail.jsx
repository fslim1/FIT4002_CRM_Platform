import {
    X,
    Mail,
    Phone,
    ExternalLink,
    Building2,
    Calendar,
    ArrowRight,
    UserRound,
    Trash2
} from "lucide-react";

import {Link} from "react-router-dom";
import {useAuth} from "@/context/auth";
import {Pencil} from "lucide-react";
import {Badge} from "@/components/ui/badge";

const TaskDetail = ({task, onClose, onEdit, onDelete}) => {
    console.log(task);
    if (!task) return null;

    const {user} = useAuth();

    const isCreator = user && task.createdBy && task.createdBy._id === user.id;
    const isSupervisorOrAbove = user?.role === 'Supervisor' || user?.role === 'Admin';
   
    const canEdit = isCreator || isSupervisorOrAbove;
    const canDelete = isSupervisorOrAbove;

    const priorityClass =
        task.priority === "High"
            ? "prio-high"
            : task.priority === "Medium"
                ? "prio-medium"
                : "prio-low";

    return (
        <div className="task-detail-overlay" onClick={onClose}>
            <div className="task-detail-panel" onClick={(e) => e.stopPropagation()}>
                {/* CLOSE BUTTON */}
                <button className="close-btn" onClick={onClose}>
                    <X size={20}/>
                </button>

                {/* HEADER */}
                <header className="detail-header">
                    <h2>{task.title}</h2>

                    <p className="subtitle">
                        {task.description || "No description provided"}
                    </p>
                </header>

                {/* TOP DETAILS */}
                <div className="detail-grid">
                    {/* CUSTOMER */}
                    <div className="detail-item">
                        <label>CUSTOMER</label>

                        <div className="item-content">
                            <Building2 size={14}/>

                            {task.customer?.fullName || task.company || "No customer"}
                        </div>
                    </div>

                    {/* PRIORITY */}
                    <div className="detail-item">
                        <label>PRIORITY</label>

                        <span className={`prio-tag ${priorityClass}`}>{task.priority}</span>
                    </div>

                    {/* DUE DATE */}
                    <div className="detail-item">
                        <label>DUE DATE</label>

                        <div className="item-content">
                            <Calendar size={14}/>

                            {task.dueDate
                                ? new Date(task.dueDate).toLocaleDateString()
                                : "No due date"}
                        </div>
                    </div>

                    {/* ASSIGNEES */}
                    <div className="detail-item">
                        <label>ASSIGNEES</label>

                        <div className="assignee-list">
                            {task.assignedTo?.length > 0 ? (
                                task.assignedTo.map((person, index) => (
                                    <span key={index} className="assignee-pill">
                    {person.fullName}
                  </span>
                                ))
                            ) : (
                                <span>No assignees</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* CREATED BY */}
                <div className="detail-item">
                    <label>CREATED BY</label>

                    <div className="creator-pill">
                        {task.createdBy?._id === user?.id ? (
                            <Badge variant="secondary" className="you-badge">
                                <UserRound size={14}/>
                                You
                            </Badge>
                        ) : (
                            <>
                                <div className="creator-avatar">
                                    {task.createdBy?.fullName?.charAt(0).toUpperCase()}
                                </div>

                                <span>{task.createdBy?.fullName}</span>
                            </>
                        )}
                    </div>
                </div>

                {/* PIPELINE DEAL */}
                <div className="pipeline-section">
                    <label>PIPELINE DEAL</label>

                    <div className="pipeline-box">
                        <div className="pipeline-info">
              <span>
                Deal:
                <strong> {task.deal?.name || "No deal linked"}</strong>
              </span>

                            <ArrowRight size={18}/>

                            <span>
                Stage:
                <strong> {task.deal?.stage || "N/A"}</strong>
              </span>
                        </div>

                        <Link to="/pipeline" className="pipeline-link">
                            View Pipeline
                        </Link>
                    </div>
                </div>

                {/* TIMELINE */}
                <div className="activity-section">
                    <label>ACTIVITY TIMELINE</label>

                    {task.customer?.interactions?.length > 0 ? (
                        <div className="timeline-list">
                            {task.customer.interactions
                                .slice()
                                .reverse()
                                .map((activity, index) => (
                                    <div key={index} className="timeline-card">
                                        <div className="timeline-icon">
                                            {activity.type === "Call" ? (
                                                <Phone size={16}/>
                                            ) : (
                                                <Mail size={16}/>
                                            )}
                                        </div>

                                        <div className="timeline-content">
                                            <div className="timeline-top">
                                                <span>{activity.type}</span>
                                                <span>
                          {new Date(activity.date).toLocaleDateString()}
                        </span>
                                            </div>

                                            <div className="timeline-message">{activity.details}</div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    ) : (
                        <p>No activities yet</p>
                    )}
                </div>
                {/* FOOTER */}
                <footer className="detail-footer">
                    {canEdit && (
                        <button className="btn-edit" onClick={() => onEdit(task)}>
                            <Pencil size={18}/>
                            Edit Task
                        </button>
                    )}


                    <button className="btn-email">
                        <Mail size={16}/>
                        Send Email
                    </button>

                    {task.customer && (
                        <Link
                            to={`/customers/${task.customer._id}`}
                            className="btn-profile"
                        >
                            <ExternalLink size={16}/>
                            View Profile
                        </Link>
                    )}

                    {canDelete && (
    <button className="btn-delete" onClick={() => onDelete(task)} aria-label="Delete task" title="Delete task">
        <Trash2 size={18}/>
    </button>
)}

                </footer>
            </div>
        </div>
    );
};

export default TaskDetail;
