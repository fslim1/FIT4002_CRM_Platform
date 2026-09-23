import { useEffect, useState } from 'react';
import { FiBell, FiX, FiCheckCircle, FiCircle } from 'react-icons/fi';
import { getNotifications, markNotificationsRead } from '../api/notifications';
import '../styles/NotificationBell.css';

function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const fetchNotifications = async () => {
    try {
      const data = await getNotifications();
      setNotifications(data || []);
    } catch (error) {
      console.error('Failed to fetch notifications', error);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await markNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch (error) {
      console.error('Failed to mark notifications read', error);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="notification-bell-container">
      <div className="bell-icon-wrapper" onClick={() => setIsOpen(!isOpen)}>
        <FiBell className="header-bell-icon" />
        {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
      </div>

      {isOpen && (
        <div className="notification-dropdown">
          <div className="notif-dropdown-header">
            <h4>Notifications ({unreadCount} unread)</h4>
            <button onClick={() => setIsOpen(false)} className="notif-close-btn">
              <FiX />
            </button>
          </div>

          <div className="notif-dropdown-list">
            {notifications.length > 0 ? (
              notifications.map((notif) => (
                <div
                  key={notif._id}
                  className={`notif-dropdown-item ${notif.read ? 'read' : 'unread'}`}
                >
                  <div className="notif-item-content">
                    <h5>{notif.title || 'New update'}</h5>
                    <p>{notif.message}</p>
                    <span className="notif-time">
                      {notif.createdAt ? new Date(notif.createdAt).toLocaleString() : 'Just now'}
                    </span>
                  </div>

                  <button
                    className="toggle-read-btn"
                    onClick={() => handleMarkAllRead()}
                    title={notif.read ? 'Already read' : 'Mark all as read'}
                  >
                    {notif.read ? <FiCircle /> : <FiCheckCircle />}
                  </button>
                </div>
              ))
            ) : (
              <p className="empty-notif-text">All caught up!</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;