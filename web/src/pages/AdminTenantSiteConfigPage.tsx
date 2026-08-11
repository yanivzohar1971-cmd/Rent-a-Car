import { Navigate } from 'react-router-dom';

/**
 * Legacy route: `/admin/tenant-site-config` redirects to Website Builder.
 */
export default function AdminTenantSiteConfigPage() {
  return <Navigate to="/admin/tenant-site-builder" replace />;
}
