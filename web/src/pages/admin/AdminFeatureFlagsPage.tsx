/**
 * Admin Feature Flags Page
 * 
 * Allows admins to toggle runtime feature flags stored in Firestore.
 * These flags control public-facing features without requiring redeployment.
 */

import { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase/firebaseClient';
import { useAuth } from '../../context/AuthContext';
import './AdminFeatureFlagsPage.css';

interface FeatureFlags {
  enablePublicCarDebugButton?: boolean;
  enablePublicCarDebugOverlay?: boolean;
  lastUpdatedAt?: any;
  updatedBy?: string;
}

export default function AdminFeatureFlagsPage() {
  const { userProfile } = useAuth();
  const [flags, setFlags] = useState<FeatureFlags>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Load current flags from Firestore
  useEffect(() => {
    const loadFlags = async () => {
      try {
        setLoading(true);
        const flagsRef = doc(db, 'publicConfig', 'features');
        const flagsDoc = await getDoc(flagsRef);
        
        if (flagsDoc.exists()) {
          setFlags(flagsDoc.data() as FeatureFlags);
        } else {
          // Initialize with defaults if doc doesn't exist
          setFlags({
            enablePublicCarDebugButton: false,
            enablePublicCarDebugOverlay: false,
          });
        }
      } catch (err: any) {
        console.error('[AdminFeatureFlagsPage] Error loading flags:', err);
        setError(`Failed to load feature flags: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (userProfile?.isAdmin) {
      loadFlags();
    }
  }, [userProfile]);

  const handleToggle = async (flagKey: keyof FeatureFlags) => {
    try {
      setSaving(true);
      setError(null);
      setSuccessMessage(null);

      const newValue = !flags[flagKey];
      const updatedFlags: FeatureFlags = {
        ...flags,
        [flagKey]: newValue,
        lastUpdatedAt: serverTimestamp(),
        updatedBy: userProfile?.email || userProfile?.uid || 'unknown',
      };

      const flagsRef = doc(db, 'publicConfig', 'features');
      await setDoc(flagsRef, updatedFlags, { merge: true });

      setFlags(updatedFlags);
      setSuccessMessage(`Feature flag "${flagKey}" ${newValue ? 'enabled' : 'disabled'} successfully`);

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      console.error('[AdminFeatureFlagsPage] Error saving flag:', err);
      setError(`Failed to save: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  if (!userProfile?.isAdmin) {
    return (
      <div className="admin-feature-flags-page">
        <div className="card">
          <h1>Access Denied</h1>
          <p>Only administrators can access this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-feature-flags-page">
        <div className="card">
          <p>Loading feature flags...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-feature-flags-page">
      <div className="card">
        <h1>Feature Flags (Admin)</h1>
        <p className="subtitle">
          Toggle runtime features without redeployment. Changes take effect immediately for all users.
        </p>

        {error && (
          <div className="alert alert-error">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="alert alert-success">
            {successMessage}
          </div>
        )}

        <div className="feature-flags-list">
          {/* Public Car Debug Button */}
          <div className="feature-flag-item">
            <div className="flag-header">
              <div className="flag-info">
                <h3>Emergency Debug Button (Car Details)</h3>
                <p className="flag-description">
                  Shows a "DEBUG מוכר/מגרש" button on the public Car Details page.
                  Allows anyone to see the exact seller snapshot fields from publicCars.
                  <strong> Use for diagnosing seller visibility issues.</strong>
                </p>
                <p className="flag-note">
                  <strong>⚠️ Visible to ALL users (including non-authenticated buyers) when enabled.</strong>
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={flags.enablePublicCarDebugButton || false}
                  onChange={() => handleToggle('enablePublicCarDebugButton')}
                  disabled={saving}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="flag-status">
              Status: <span className={flags.enablePublicCarDebugButton ? 'status-enabled' : 'status-disabled'}>
                {flags.enablePublicCarDebugButton ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
          </div>

          {/* Public Car Debug Overlay (optional) */}
          <div className="feature-flag-item">
            <div className="flag-header">
              <div className="flag-info">
                <h3>Debug Overlay Indicator (YardCard)</h3>
                <p className="flag-description">
                  Shows inline badge on YardCard indicating if seller snapshot is present/missing.
                  Helps identify which cars have incomplete publicCars projections.
                </p>
                <p className="flag-note">
                  <em>Optional: Can enable independently of debug button.</em>
                </p>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={flags.enablePublicCarDebugOverlay || false}
                  onChange={() => handleToggle('enablePublicCarDebugOverlay')}
                  disabled={saving}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
            <div className="flag-status">
              Status: <span className={flags.enablePublicCarDebugOverlay ? 'status-enabled' : 'status-disabled'}>
                {flags.enablePublicCarDebugOverlay ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
          </div>
        </div>

        {flags.lastUpdatedAt && (
          <div className="flags-metadata">
            <p>
              <strong>Last updated:</strong> {new Date(flags.lastUpdatedAt?.toMillis?.() || flags.lastUpdatedAt).toLocaleString('he-IL')}
            </p>
            {flags.updatedBy && (
              <p>
                <strong>Updated by:</strong> {flags.updatedBy}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Usage Instructions</h2>
        <ol>
          <li>Enable the "Emergency Debug Button" toggle above</li>
          <li>Open any car details page (e.g., /cars/:carId) as a public user</li>
          <li>Click the "DEBUG מוכר/מגרש" button (bottom-left corner)</li>
          <li>Inspect the seller snapshot fields and diagnostics</li>
          <li>Use "Copy debug JSON" to share with developers</li>
          <li>When done, disable the toggle to hide the button from public users</li>
        </ol>
        <p>
          <strong>Note:</strong> The debug button respects Firestore Rules and will not expose any private data
          beyond what is already in the public publicCars collection.
        </p>
      </div>
    </div>
  );
}
