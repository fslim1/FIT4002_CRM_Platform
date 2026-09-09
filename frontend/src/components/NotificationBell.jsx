import React, { useState } from 'react';
import { FiBell, FiX, FiCheckCircle, FiCircle } from 'react-icons/fi';
import '../styles/NotificationBell.css';

function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);

  // Mock notification array matching your UML attributes
  const [notifications, setNotifications] = useState([
    {
      notificationId: "n1",
      title: "New Email Received",
      message: "John Smith replied regarding the Solar grid expansion terms.",
      isRead: false,
      createdAt: "5 mins ago"
    },
    {
      notificationId: "n2",
      title: "Task Overdue",
      message: "Follow-up call scheduled with Hiba Zaman is past its deadline.",
      isRead: true,
      createdAt: "2 hours ago"
    }
  ]);

  // Handle [D8] Toggle Read / Unread status
  const toggleReadStatus = (id) => {
      setNotifications(notifications.map(notif =>
          notif.notificationId === id ? {...notif, isRead: !notif.isRead} : notif
    ));
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  return (
      <div className="notification-bell-container">
          {/* Bell Icon with Dynamic Count Badge */}
          <div className="bell-icon-wrapper" onClick={() => setIsOpen(!isOpen)}>
              <FiBell className="header-bell-icon"/>
              {unreadCount > 0 && <span className="bell-badge">{unreadCount}</span>}
          </div>

          {/* Floating Notification Dropdown */}
          {isOpen && (
              <div className="notification-dropdown">
                  <div className="notif-dropdown-header">
                      <h4>Notifications ({unreadCount} unread)</h4>
                      <button onClick={() => setIsOpen(false)} className="notif-close-btn"><FiX/></button>
                  </div>

                  <div className="notif-dropdown-list">
                      {notifications.length > 0 ? (
                          notifications.map((notif) => (
                              <div
                                  key={notif.notificationId}
                                  className={`notif-dropdown-item ${notif.isRead ? 'read' : 'unread'}`}
                              >
                                  <div className="notif-item-content">
                                      <h5>{notif.title}</h5>
                                      <p>{notif.message}</p>
                                      <span className="notif-time">{notif.createdAt}</span>
                                  </div>

                                  {/* Action button to satisfy [D8] */}
                                  <button
                                      className="toggle-read-btn"
                                      onClick={() => toggleReadStatus(notif.notificationId)}
                                      title={notif.isRead ? "Mark as unread" : "Mark as read"}
                                  >
                                      {notif.isRead ? <FiCircle/> : <FiCheckCircle/>}
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