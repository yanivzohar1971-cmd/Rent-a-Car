import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { subscribeFeatureFlags, setFeatureFlag, type FeatureFlags } from '../../api/featureFlagsApi';
import './FeatureFlagsPage.css';

interface FlagCardConfig {
  key: keyof FeatureFlags;
  title: string;
  description: string;
}

const GOV_DEBUGGER_LS_KEY = 'admin.govDebugger';

export default function FeatureFlagsPage() {
  const { firebaseUser } = useAuth();
  const [flags, setFlags] = useState<FeatureFlags>({
    enablePublicTenantDebugButton: false,
    enablePublicCarDebugButtonCards: false,
    enablePublicCarDebugButtonCarDetails: false,
    enablePublicCarDebugOverlayCards: false,
    enableAdminSellerDebugger: false,
    enableAdminSellerDebugOverlay: false,
  });
  const [loading, setLoading] = useState(true);
  
  // Optimistic UI: per-flag state to prevent flicker
  const [optimisticByKey, setOptimisticByKey] = useState<Record<string, boolean | undefined>>({});
  const [savingByKey, setSavingByKey] = useState<Record<string, boolean>>({});
  const [errorByKey, setErrorByKey] = useState<Record<string, string | null>>({});

  // Admin-only local toggle: GOV DEBUGGER (Yard Fleet per-row diagnostic). Not in Firestore.
  const [govDebuggerOn, setGovDebuggerOn] = useState(() =>
    typeof localStorage !== 'undefined' && localStorage.getItem(GOV_DEBUGGER_LS_KEY) === '1'
  );
  const handleGovDebuggerToggle = () => {
    const next = !govDebuggerOn;
    setGovDebuggerOn(next);
    localStorage.setItem(GOV_DEBUGGER_LS_KEY, next ? '1' : '0');
  };

  useEffect(() => {
    const unsubscribe = subscribeFeatureFlags((newFlags) => {
      setFlags(newFlags);
      setLoading(false);
      // Clear optimistic state when snapshot matches (or after a delay)
      // For now, we keep optimistic until user toggles again or page reloads
    });

    return () => unsubscribe();
  }, []);

  const handleToggle = async (flagKey: keyof FeatureFlags) => {
    // Get current value (optimistic or real)
    const currentValue = optimisticByKey[flagKey] ?? Boolean(flags[flagKey]);
    const newValue = !currentValue;
    
    // Optimistic update: update UI immediately (no flicker)
    setOptimisticByKey(prev => ({ ...prev, [flagKey]: newValue }));
    setSavingByKey(prev => ({ ...prev, [flagKey]: true }));
    setErrorByKey(prev => ({ ...prev, [flagKey]: null }));
    
    try {
      await setFeatureFlag(
        flagKey,
        newValue,
        firebaseUser?.email ?? undefined,
        firebaseUser?.uid
      );
      // On success: keep optimistic until snapshot arrives (or clear after short delay)
      // The snapshot will eventually update flags, and we can clear optimistic then
      setTimeout(() => {
        setOptimisticByKey(prev => {
          const updated = { ...prev };
          delete updated[flagKey];
          return updated;
        });
      }, 500); // Clear optimistic after 500ms (snapshot should arrive by then)
    } catch (error: any) {
      console.error('[FeatureFlagsPage] Error updating flag:', error);
      // Revert optimistic update on error
      setOptimisticByKey(prev => {
        const updated = { ...prev };
        delete updated[flagKey];
        return updated;
      });
      setErrorByKey(prev => ({ ...prev, [flagKey]: error.message || 'שגיאה בעדכון הדגל' }));
    } finally {
      setSavingByKey(prev => ({ ...prev, [flagKey]: false }));
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

  // Memoize card config to prevent remounting on every render
  const flagCards = useMemo<FlagCardConfig[]>(() => [
    {
      key: 'enablePublicTenantDebugButton',
      title: 'Public Tenant Storefront DEBUG (copy JSON)',
      description:
        'Small fixed DEBUG button on tenant public home / cars / car details. Click copies a page-specific JSON snapshot to the clipboard (no overlay, no modal).',
    },
    {
      key: 'enablePublicCarDebugButtonCarDetails',
      title: 'Public Car 🐞 DEBUG Button (Car Details)',
      description: 'Shows floating "🐞 DEBUG מוכר/מגרש" button on CarDetailsPage. Displays seller/yard snapshot data for troubleshooting missing info.',
    },
    {
      key: 'enablePublicCarDebugButtonCards',
      title: 'Public Car 🐞 DEBUG Button (Listing Cards)',
      description: 'Shows "🐞 DEBUG" button on car listing cards (search/list/sale pages). Opens modal with JSON payload (views, snapshots, exposure) and 🗐 COPY JSON button.',
    },
    {
      key: 'enablePublicCarDebugOverlayCards',
      title: 'Public Car Debug Overlay (Listing Cards)',
      description: 'Shows small badge on car list items indicating snapshot and views status. Helps identify cars with missing seller/yard snapshot data or views count.',
    },
    {
      key: 'enableAdminSellerDebugger',
      title: 'Admin Seller Debugger',
      description: 'Enable Seller Debugger topic in Admin Debug Console. Shows seller/yard profile resolution diagnostics.',
    },
  ], []);

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
          Admin-only control for debug features visible to public users. Tenant storefront “DEBUG copy JSON” (fixed corner
          button, no modal) is separate from per-car “🐞 DEBUG” on listing cards or car details.
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
          {flagCards.map((card) => {
            const flagKey = card.key;
            const isSaving = savingByKey[flagKey] ?? false;
            const error = errorByKey[flagKey];
            // Use optimistic value if available, otherwise use real flag value
            const checked = optimisticByKey[flagKey] ?? Boolean(flags[flagKey]);
            
            return (
              <div key={flagKey} className="feature-flag-card">
                <div className="flag-header">
                  <h3>{card.title}</h3>
                  <label className="flag-toggle">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => handleToggle(flagKey)}
                      disabled={isSaving}
                    />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                <p className="flag-description">{card.description}</p>
                
                {/* Per-card saving indicator (no full-page overlay) */}
                {isSaving && (
                  <div style={{ 
                    marginTop: '0.5rem', 
                    fontSize: '0.875rem', 
                    color: '#666',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}>
                    <span>⏳ PROCESSING</span>
                  </div>
                )}
                
                {/* Per-card error indicator */}
                {error && (
                  <div style={{ 
                    marginTop: '0.5rem', 
                    fontSize: '0.875rem', 
                    color: '#dc3545',
                  }}>
                    {error}
                  </div>
                )}
                
                <div className={`flag-status ${checked ? 'active' : 'inactive'}`}>
                  Status: {checked ? '🟢 ENABLED' : '🔴 DISABLED'}
                </div>
                <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
                  Doc: publicConfig/features | Key: {flagKey} | Value: {String(checked)} ({typeof checked})
                </div>
              </div>
            );
          })}
        </div>

        {/* Admin UI (local) – GOV DEBUGGER. Stored in localStorage only; visible in Yard Fleet when ON. */}
        <div className="feature-flags-grid" style={{ marginTop: '2rem' }}>
          <div className="feature-flag-card">
            <div className="flag-header">
              <h3>GOV DEBUGGER</h3>
              <label className="flag-toggle">
                <input
                  type="checkbox"
                  checked={govDebuggerOn}
                  onChange={handleGovDebuggerToggle}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <p className="flag-description">
              When ON: shows a &quot;DEBUGGER&quot; button next to each car row on Yard Fleet. Click to run CKAN-only GOV sync and see result (copyable JSON). Stored in localStorage (admin.govDebugger). Default OFF.
            </p>
            <div className={`flag-status ${govDebuggerOn ? 'active' : 'inactive'}`}>
              Status: {govDebuggerOn ? '🟢 ENABLED' : '🔴 DISABLED'}
            </div>
            <div style={{ marginTop: '0.5rem', fontSize: '12px', color: '#666', fontFamily: 'monospace' }}>
              localStorage key: {GOV_DEBUGGER_LS_KEY} | Value: {govDebuggerOn ? '1' : '0'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
