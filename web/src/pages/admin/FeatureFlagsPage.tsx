import { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { subscribeFeatureFlags, setFeatureFlag, type FeatureFlags } from '../../api/featureFlagsApi';
import './FeatureFlagsPage.css';

export default function FeatureFlagsPage() {
  const { firebaseUser } = useAuth();
  const [flags, setFlags] = useState<FeatureFlags>({
    enablePublicCarDebugButton: false,
    enablePublicCarDebugOverlay: false,
    enableAdminSellerDebugger: false,
    enableAdminSellerDebugOverlay: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeFeatureFlags((newFlags) => {
      setFlags(newFlags);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleToggle = async (flagKey: keyof FeatureFlags) => {
    if (saving) return;

    setSaving(true);
    try {
      await setFeatureFlag(
        { [flagKey]: !flags[flagKey] },
        firebaseUser?.email ?? undefined,
        firebaseUser?.uid
      );
    } catch (error) {
      console.error('[FeatureFlagsPage] Error updating flag:', error);
      alert('שגיאה בעדכון הדגל. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  const formatTimestamp = (ts: any) => {
    if (!ts) return 'N/A';
    try {
      if (ts.toDate) {
        return ts.toDate().toLocaleString('he-IL');
      }
      if (ts.seconds) {
        return new Date(ts.seconds * 1000).toLocaleString('he-IL');
      }
      return new Date(ts).toLocaleString('he-IL');
    } catch {
      return 'N/A';
    }
  };

  if (loading) {
    return (
      <div className="feature-flags-page">
        <div className="admin-content-wrapper">
          <h1>Feature Flags (Debug)</h1>
          <p>טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="feature-flags-page">
      <div className="admin-content-wrapper">
        <h1>Feature Flags (Debug)</h1>
        <p className="feature-flags-subtitle">
          Admin-only control for debug features visible to public users
        </p>

        <div className="feature-flags-status">
          <div className="status-item">
            <strong>Last Updated:</strong> {formatTimestamp(flags.lastUpdatedAt)}
          </div>
          <div className="status-item">
            <strong>Updated By:</strong> {flags.updatedBy || 'N/A'}
          </div>
        </div>

        <div className="feature-flags-grid">
          {/* Public Car Debug Button (Car Details Page) */}
          <div className="feature-flag-card">
            <div className="flag-header">
              <h3>Public Car Debug Button (Car Details)</h3>
              <label className="flag-toggle">
                <input
                  type="checkbox"
                  checked={flags.enablePublicCarDebugButton}
                  onChange={() => handleToggle('enablePublicCarDebugButton')}
                  disabled={saving}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <p className="flag-description">
              Shows floating "DEBUG מוכר/מגרש" button on CarDetailsPage.
              Displays seller/yard snapshot data for troubleshooting missing info.
            </p>
            <div className={`flag-status ${flags.enablePublicCarDebugButton ? 'active' : 'inactive'}`}>
              Status: {flags.enablePublicCarDebugButton ? '🟢 ENABLED' : '🔴 DISABLED'}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
              Doc: publicConfig/features | Value: {String(flags.enablePublicCarDebugButton)} ({typeof flags.enablePublicCarDebugButton})
            </div>
          </div>

          {/* Public Car Debug Button (Listing Cards) */}
          <div className="feature-flag-card">
            <div className="flag-header">
              <h3>Public Car Debug Button (Cards)</h3>
              <label className="flag-toggle">
                <input
                  type="checkbox"
                  checked={flags.enablePublicCarDebugButton}
                  onChange={() => handleToggle('enablePublicCarDebugButton')}
                  disabled={saving}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <p className="flag-description">
              Shows "DEBUG 🔍" button on car listing cards (search/list/sale pages).
              Opens modal with JSON payload (views, snapshots, exposure) and Copy JSON button.
            </p>
            <div className={`flag-status ${flags.enablePublicCarDebugButton ? 'active' : 'inactive'}`}>
              Status: {flags.enablePublicCarDebugButton ? '🟢 ENABLED' : '🔴 DISABLED'}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
              Doc: publicConfig/features | Value: {String(flags.enablePublicCarDebugButton)} ({typeof flags.enablePublicCarDebugButton})
            </div>
          </div>

          {/* Public Car Debug Overlay (Listing Cards) */}
          <div className="feature-flag-card">
            <div className="flag-header">
              <h3>Public Car Debug Overlay (Cards)</h3>
              <label className="flag-toggle">
                <input
                  type="checkbox"
                  checked={flags.enablePublicCarDebugOverlay}
                  onChange={() => handleToggle('enablePublicCarDebugOverlay')}
                  disabled={saving}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <p className="flag-description">
              Shows small badge on car list items indicating snapshot and views status.
              Helps identify cars with missing seller/yard snapshot data or views count.
            </p>
            <div className={`flag-status ${flags.enablePublicCarDebugOverlay ? 'active' : 'inactive'}`}>
              Status: {flags.enablePublicCarDebugOverlay ? '🟢 ENABLED' : '🔴 DISABLED'}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
              Doc: publicConfig/features | Value: {String(flags.enablePublicCarDebugOverlay)} ({typeof flags.enablePublicCarDebugOverlay})
            </div>
          </div>

          {/* Admin Seller Debugger */}
          <div className="feature-flag-card">
            <div className="flag-header">
              <h3>Admin Seller Debugger</h3>
              <label className="flag-toggle">
                <input
                  type="checkbox"
                  checked={flags.enableAdminSellerDebugger}
                  onChange={() => handleToggle('enableAdminSellerDebugger')}
                  disabled={saving}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <p className="flag-description">
              Enable Seller Debugger topic in Admin Debug Console. Shows seller/yard profile resolution diagnostics.
            </p>
            <div className={`flag-status ${flags.enableAdminSellerDebugger ? 'active' : 'inactive'}`}>
              Status: {flags.enableAdminSellerDebugger ? '🟢 ENABLED' : '🔴 DISABLED'}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
              Doc: publicConfig/features | Value: {String(flags.enableAdminSellerDebugger)} ({typeof flags.enableAdminSellerDebugger})
            </div>
          </div>
        </div>

        {saving && (
          <div className="feature-flags-saving-overlay">
            <div className="saving-spinner">שומר...</div>
          </div>
        )}
      </div>
    </div>
  );
}
