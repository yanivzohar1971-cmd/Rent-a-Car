import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  observeUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type UserNotification,
} from '../api/notificationsApi';
import './NotificationBell.css';

export default function NotificationBell() {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Observe notifications
  useEffect(() => {
    if (!firebaseUser) {
      setNotifications([]);
      return;
    }

    const unsubscribe = observeUserNotifications(firebaseUser.uid, (updatedNotifications) => {
      setNotifications(updatedNotifications);
    });

    return () => unsubscribe();
  }, [firebaseUser]);

  // Close panel when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const displayCount = unreadCount > 9 ? '9+' : unreadCount.toString();

  const handleNotificationClick = async (notification: UserNotification) => {
    if (!firebaseUser) return;

    // Mark as read
    if (!notification.isRead) {
      try {
        await markNotificationRead(firebaseUser.uid, notification.id);
      } catch (err) {
        console.error('Error marking notification as read:', err);
      }
    }

    // Navigate to car
    if (notification.type === 'CAR_MATCH') {
      navigate(`/cars/${notification.carId}`);
      setIsOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    if (!firebaseUser) return;

    try {
      await markAllNotificationsRead(firebaseUser.uid);
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      if (diffMins < 1) return 'עכשיו';
      if (diffMins < 60) return `לפני ${diffMins} דקות`;
      if (diffHours < 24) return `לפני ${diffHours} שעות`;
      if (diffDays < 7) return `לפני ${diffDays} ימים`;
      return new Intl.DateTimeFormat('he-IL', {
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    } catch {
      return '';
    }
  };

  if (!firebaseUser) {
    return null;
  }

  return (
    <div className="notification-bell-container" ref={panelRef}>
      <button
        type="button"
        className="notification-bell-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="התראות"
      >
        <span className="bell-icon">🔔</span>
        {unreadCount > 0 && (
          <span className="notification-badge">{displayCount}</span>
        )}
      </button>

      {isOpen && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <h3>התראות</h3>
            {unreadCount > 0 && (
              <button
                type="button"
                className="btn-mark-all-read"
                onClick={handleMarkAllRead}
              >
                סמן הכל כנקרא
              </button>
            )}
          </div>

          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="notification-empty">
                <p>אין התראות</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`notification-item ${!notification.isRead ? 'unread' : ''}`}
                  onClick={() => handleNotificationClick(notification)}
                >
                  <div className="notification-content">
                    <h4 className="notification-title">{notification.title}</h4>
                    <p className="notification-body">{notification.body}</p>
                    <span className="notification-time">
                      {formatTimestamp(notification.createdAt)}
                    </span>
                  </div>
                  {!notification.isRead && <div className="notification-dot" />}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

