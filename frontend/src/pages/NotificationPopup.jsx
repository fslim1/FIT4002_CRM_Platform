import { X, Bell, Clock3, AlertCircle, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";

import { getNotifications, markNotificationsRead } from "../api/notifications";

const NotificationPopup = ({ onClose }) => {
    const [notifications, setNotifications] = useState([]);
    useEffect(() => {
        getNotifications()
            .then((data) => setNotifications(data))
            .catch((err) => console.error(err));
    }, []);

    const getIcon = (type) => {
        switch (type) {
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

            // update UI instantly
            setNotifications((prev) => prev.map((n) => ({...n, read: true})));
        } catch (err) {
            console.error(err);
        }
    };
    return (
        <div className="notif-popup-overlay" onClick={onClose}>
            <div className="notif-popup" onClick={(e) => e.stopPropagation()}>
                {/* HEADER */}
                <div className="notif-header">
                    <h2>Notifications</h2>

                    <button onClick={onClose}>
                        <X size={22}/>
                    </button>
                </div>

                {/* LIST */}
                <div className="notif-list">
                    {notifications.map((notif) => (
                        <div key={notif._id} className="notif-card">
                            <div className={`notif-icon ${notif.type}`}>
                                {getIcon(notif.type)}
                            </div>

                            <div className="notif-content">
                                <p>{notif.message}</p>

                                <span>{new Date(notif.createdAt).toLocaleDateString()}</span>
                            </div>

                            <div className="notif-dot"></div>
                        </div>
                    ))}
                </div>

                {/* FOOTER */}
                <button className="mark-read-btn" onClick={handleMarkAllRead}>
                    Mark all as read
                </button>
            </div>
        </div>
    );
};

export default NotificationPopup;
