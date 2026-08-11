import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './AdminHeader.css';

/**
 * AdminHeader - Persistent header for all admin pages
 * Shows "ADMIN MODE" badge and "Back to Personal Area" button
 */
export default function AdminHeader() {
  const navigate = useNavigate();
  const { firebaseUser } = useAuth();

  return (
    <div className="admin-header">
      <div className="admin-header-content">
        <div className="admin-header-left">
          <span className="admin-mode-badge">מצב ADMIN</span>
          {firebaseUser?.email && (
            <span className="admin-email">{firebaseUser.email}</span>
          )}
        </div>
        <div className="admin-header-right">
          <button
            className="admin-back-button"
            onClick={() => navigate('/account')}
            type="button"
          >
            חזרה לאזור האישי
          </button>
        </div>
      </div>
    </div>
  );
}
