/**
 * YardCard - Displays yard branding and contact information on car details page
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadYardProfileByUid, type YardProfileData } from '../../api/yardProfileApi';
import './YardCard.css';

interface YardCardProps {
  yardUid?: string | null;
  yardNameOverride?: string | null;
  yardPhoneOverride?: string | null;
}

export default function YardCard({ yardUid, yardNameOverride, yardPhoneOverride }: YardCardProps) {
  const [yardProfile, setYardProfile] = useState<YardProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If we have override data, skip fetch (public data should come from publicCars snapshot)
    if (yardNameOverride || yardPhoneOverride) {
      setLoading(false);
      return;
    }

    if (!yardUid) {
      setLoading(false);
      return;
    }

    // Only fetch if no override (for backward compatibility with logged-in users)
    // NOTE: For public pages, override should always be provided from publicCars
    setLoading(true);
    loadYardProfileByUid(yardUid)
      .then((profile) => {
        setYardProfile(profile);
      })
      .catch((err) => {
        console.error('[YardCard] Error loading yard profile:', err);
        setYardProfile(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [yardUid, yardNameOverride, yardPhoneOverride]);

  // Use override if available, otherwise fallback to profile
  // FAIL-SAFE: Never hide seller card - show placeholders if data is missing
  const yardName = yardNameOverride ?? (yardProfile?.displayName || 'לא צוין');
  const phone = yardPhoneOverride ?? (yardProfile?.phone || yardProfile?.secondaryPhone || null);
  
  // Always show the card (never return null) - public UI must be resilient
  // If no data at all, show placeholders
  const hasAnyData = yardNameOverride || yardPhoneOverride || yardProfile !== null;
  
  if (loading && !hasAnyData) {
    return (
      <div className="yard-card">
        <div className="yard-card-loading">טוען פרטי מוכר...</div>
      </div>
    );
  }

  const hasLocation = yardProfile?.yardLocationLat && yardProfile?.yardLocationLng;

  // Build WhatsApp URL - normalize phone number
  const normalizePhoneForWhatsApp = (phoneNum: string | null | undefined): string | null => {
    if (!phoneNum) return null;
    // Remove all non-digits
    let normalized = phoneNum.replace(/[^0-9]/g, '');
    // If starts with 0 (Israeli), convert to 972
    if (normalized.startsWith('0')) {
      normalized = '972' + normalized.substring(1);
    } else if (!normalized.startsWith('972')) {
      // If doesn't start with 972, assume it's Israeli and add 972
      normalized = '972' + normalized;
    }
    return normalized;
  };

  const whatsappPhone = normalizePhoneForWhatsApp(phone);
  const whatsappUrl = whatsappPhone ? `https://wa.me/${whatsappPhone}` : null;

  // Build navigation URL
  const navigationUrl = hasLocation
    ? `https://www.google.com/maps?q=${yardProfile?.yardLocationLat},${yardProfile?.yardLocationLng}`
    : yardProfile?.yardMapsUrl || null;

  return (
    <div className="yard-card">
      <div className="yard-card-header">
        {yardProfile?.yardLogoUrl ? (
          <img
            src={yardProfile.yardLogoUrl}
            alt={yardName}
            className="yard-logo"
          />
        ) : (
          <div className="yard-logo-placeholder">
            {yardName.charAt(0)}
          </div>
        )}
        <div className="yard-info">
          <div className="yard-name-row">
            <span className="yard-name">{yardName}</span>
            <span className="yard-label">מוכר</span>
          </div>
          {(yardProfile?.address || yardProfile?.city || yardNameOverride) && (
            <div className="yard-location">
              {yardProfile?.address && <span>{yardProfile.address}</span>}
              {yardProfile?.address && yardProfile?.city && <span className="location-separator">, </span>}
              {yardProfile?.city && <span>{yardProfile.city}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="yard-card-actions">
        {/* FAIL-SAFE: Show buttons only if phone exists, but never hide entire card */}
        {phone ? (
          <>
            <a href={`tel:${phone}`} className="yard-action-btn yard-action-call">
              התקשר
            </a>
            {whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="yard-action-btn yard-action-whatsapp"
              >
                וואטסאפ
              </a>
            )}
          </>
        ) : (
          <span className="yard-action-placeholder">טלפון: לא צוין</span>
        )}
        {navigationUrl && (
          <a
            href={navigationUrl}
            target="_blank"
            rel="noreferrer"
            className="yard-action-btn yard-action-navigate"
          >
            ניווט
          </a>
        )}
        <Link
          to={`/yard/${yardUid}`}
          className="yard-action-btn yard-action-profile"
        >
          פרטי מגרש
        </Link>
      </div>
    </div>
  );
}

