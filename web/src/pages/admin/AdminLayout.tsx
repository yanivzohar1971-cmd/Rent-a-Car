import { Outlet } from 'react-router-dom';
import AdminHeader from './AdminHeader';
import './AdminLayout.css';

/**
 * AdminLayout - Wrapper for all admin routes
 * Provides consistent header and spacing
 */
export default function AdminLayout() {
  return (
    <div className="admin-layout">
      <AdminHeader />
      <div className="admin-content">
        <Outlet />
      </div>
    </div>
  );
}
