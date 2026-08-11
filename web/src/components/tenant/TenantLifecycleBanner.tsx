import { useTenantBranding } from '../../hooks/useTenantBranding';
import { useTenant } from '../../context/TenantContext';
import './TenantLifecycleBanner.css';

export default function TenantLifecycleBanner() {
  const { isTenantHost } = useTenantBranding();
  const { tenantLifecycleBanner } = useTenant();

  if (!isTenantHost || !tenantLifecycleBanner) return null;

  return (
    <div
      className={`tenant-lifecycle-banner tenant-lifecycle-banner--${tenantLifecycleBanner.variant}`}
      role="status"
    >
      {tenantLifecycleBanner.message}
    </div>
  );
}
