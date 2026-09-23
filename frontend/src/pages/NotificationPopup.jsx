import { X, Bell, Clock3, AlertCircle, UserPlus, Mail } from "lucide-react";
import { useEffect, useState } from "react";

import { getNotifications, markNotificationsRead } from "../api/notifications";

const NotificationPopup = ({ onClose }) => {
    const [notifications, setNotifications] = useState([]);
    useEffect(() => {
        getNotifications()
            .then((data) => setNotifications(data || []))
            .catch((err) => console.error(err));
    }, []);

    const getIcon = (type) => {
        switch (type) {
            case "email":
                return <Mail size={18}/>;

            case "assigned":
                return <UserPlus size={18}/>;

            case "reminder":
                return <Bell size={18}/>;

            case "inactive":
                return <Clock3 size={18}/>;

            case "overdue":
                return <AlertCircle size={18}/>;

            default:
                return <Bell size={18}/>;
        }
    };

    const handleMarkAllRead = async () => {
        try {
            await markNotificationsRead();
            setNotifications((prev) => prev.map((n) => ({...n, read: true})));
        } catch (err) {
            console.error(err);
        }
    };

    return (
        <div className="notif-popup-overlay" onClick={onClose}>
            <div className="notif-popup" onClick={(e) => e.stopPropagation()}>
                <div className="notif-header">
                    <h2>Notifications</h2>
                    <button onClick={onClose}>
                        <X size={22}/>
                    </button>
                </div>

                <div className="notif-list">
                    {notifications.length === 0 ? (
                        <div className="notif-card empty-state">
                            <div className="notif-content">
                                <p>No notifications yet.</p>
                            </div>
                        </div>
                    ) : (
                        notifications.map((notif) => (
                            <div key={notif._id} className="notif-card">
                                <div className={`notif-icon ${notif.type || 'activity'}`}>
                                    {getIcon(notif.type)}
                                </div>

                                <div className="notif-content">
                                    <p>{notif.message}</p>
                                    <span>
                                        {notif.createdAt
                                            ? new Date(notif.createdAt).toLocaleString()
                                            : 'Just now'}
                                    </span>
                                </div>

                                {!notif.read && <div className="notif-dot"></div>}
                            </div>
                        ))
                    )}
                </div>

                <button className="mark-read-btn" onClick={handleMarkAllRead}>
                    Mark all as read
                </button>
            </div>
        </div>
    );
};

export default NotificationPopup;
