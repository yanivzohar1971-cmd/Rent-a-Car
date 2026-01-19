/**
 * YardCard - Displays yard branding and contact information on car details page
 */

import { useEffect, useState } from 'react';
import type { YardProfileData } from '../../api/yardProfileApi';
import './YardCard.css';

interface YardCardProps {
  yardUid?: string | null;
  yardNameOverride?: string | null;
  yardPhoneOverride?: string | null;
  yardLogoUrlOverride?: string | null;
  yardWhatsappPhoneOverride?: string | null;
  // Admin exposure flags (from publicCars)
  showSellerLogo?: boolean; // false = hide logo, undefined/null = show if exists
  showSellerPhone?: boolean; // false = hide phone, undefined/null = show if exists
  showSellerWhatsapp?: boolean; // false = hide WhatsApp, undefined/null = show if exists
  sellerType?: 'YARD' | 'AGENT' | 'PRIVATE' | null;
}

export default function YardCard({ 
  yardUid, 
  yardNameOverride, 
  yardPhoneOverride,
  yardLogoUrlOverride,
  yardWhatsappPhoneOverride,
  showSellerLogo,
  showSellerPhone,
  showSellerWhatsapp,
}: YardCardProps) {
  const [yardProfile] = useState<YardProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // If we have override data, skip fetch (public data should come from publicCars snapshot)
    if (yardNameOverride || yardPhoneOverride || yardLogoUrlOverride) {
      setLoading(false);
      return;
    }

    if (!yardUid) {
      setLoading(false);
      return;
    }

    // SAFETY: Do NOT call loadYardPublicProfile for public pages (unauthenticated users)
    // when overrides are missing. This prevents "admin-only" leakage dependency.
    // loadYardPublicProfile tries yards/{uid} then users/{uid}, and users/{uid} is only
    // readable by self or admin per Firestore Rules.
    // If overrides are missing on public pages, show "לא צוין" instead of failing with permission error.
    // NOTE: For logged-in users (authenticated), we can still fetch as a fallback.
    
    // Check if user is authenticated (this requires importing useAuth or checking firebase auth)
    // For simplicity, assume if we have no overrides on a public page, we should NOT fetch.
    // We rely on publicCars snapshot to have all seller data.
    // Only fetch if user is authenticated (for backward compatibility with logged-in users).
    
    // IMPLEMENTATION: Since we don't have userProfile/auth in props, we'll assume:
    // - If NO overrides are provided, it's likely a stale publicCars doc (missing snapshot).
    // - For public pages, self-heal in CarDetailsPage should trigger backfill.
    // - We should NOT fetch here to avoid permission errors for unauthenticated users.
    // - Show placeholders instead.
    
    // DECISION: DO NOT fetch at all if overrides are missing on public pages.
    // This prevents permission-denied errors for buyers/public users.
    setLoading(false);
    // Do not call loadYardPublicProfile - rely on publicCars snapshot only
    if (import.meta.env.DEV) {
      console.log('[YardCard] No seller snapshot overrides provided, skipping fetch to avoid permission errors. Relying on publicCars snapshot only.');
    }
  }, [yardUid, yardNameOverride, yardPhoneOverride, yardLogoUrlOverride]);

  // Normalize phone for tel: links (digits only, no country code conversion)
  const normalizePhoneForTel = (phoneNum: string | null | undefined): string | null => {
    if (!phoneNum) return null;
    // Remove all non-digits
    return phoneNum.replace(/[^\d]/g, '');
  };

  // Build WhatsApp URL - normalize phone number (define before use)
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

  // Use override if available, otherwise fallback to profile
  // FAIL-SAFE: Never hide seller card - show placeholders if data is missing
  const yardName = yardNameOverride ?? (yardProfile?.displayName || 'לא צוין');
  const phone = yardPhoneOverride ?? (yardProfile?.phone || yardProfile?.secondaryPhone || null);
  
  // Effective logo URL: override > profile > null
  // Apply exposure flag: if showSellerLogo === false, don't show logo even if URL exists
  const effectiveLogoUrl = (showSellerLogo === false) 
    ? null 
    : (yardLogoUrlOverride ?? yardProfile?.yardLogoUrl ?? null);
  
  // Effective WhatsApp phone: override > whatsappServicePhone > normalize effective phone
  const effectivePhone = phone;
  const whatsappServicePhone = yardProfile?.whatsappServicePhone || null;
  const effectiveWhatsappPhone = yardWhatsappPhoneOverride ?? 
    (whatsappServicePhone ? normalizePhoneForWhatsApp(whatsappServicePhone) : null) ??
    (effectivePhone ? normalizePhoneForWhatsApp(effectivePhone) : null);
  
  // Apply exposure flags for phone and WhatsApp
  const canShowPhone = showSellerPhone !== false && phone !== null;
  const canShowWhatsapp = showSellerWhatsapp !== false && effectiveWhatsappPhone !== null;
  
  // Always show the card (never return null) - public UI must be resilient
  // If no data at all, show placeholders
  const hasAnyData = yardNameOverride || yardPhoneOverride || yardLogoUrlOverride || yardProfile !== null;
  
  if (loading && !hasAnyData) {
    return (
      <div className="yard-card">
        <div className="yard-card-loading">טוען פרטי מוכר...</div>
      </div>
    );
  }

  const hasLocation = yardProfile?.yardLocationLat && yardProfile?.yardLocationLng;
  const whatsappUrl = effectiveWhatsappPhone ? `https://wa.me/${effectiveWhatsappPhone}` : null;

  // Build navigation URL
  const navigationUrl = hasLocation
    ? `https://www.google.com/maps?q=${yardProfile?.yardLocationLat},${yardProfile?.yardLocationLng}`
    : yardProfile?.yardMapsUrl || null;

  // Normalize phone for tel: and WhatsApp links
  const phoneDigits = normalizePhoneForTel(phone);
  const telUrl = phoneDigits ? `tel:${phoneDigits}` : null;

  return (
    <div className="yard-card">
      <div className="yard-card-header">
        {effectiveLogoUrl && showSellerLogo !== false ? (
          <img
            src={effectiveLogoUrl}
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

      {/* Phone number display - visible text */}
      <div className="yard-phone-display">
        {canShowPhone && phone ? (
          <div className="yard-phone-text">
            <span className="yard-phone-label">📞 טלפון:</span>
            <span className="yard-phone-number">{phone}</span>
          </div>
        ) : (
          <div className="yard-phone-text">
            <span className="yard-phone-label">📞 טלפון:</span>
            <span className="yard-phone-unavailable">לא זמין</span>
          </div>
        )}
      </div>

      <div className="yard-card-actions">
        {/* FAIL-SAFE: Show buttons only if phone exists AND exposure flag allows, but never hide entire card */}
        {canShowPhone && telUrl ? (
          <>
            <a href={telUrl} className="yard-action-btn yard-action-call">
              התקשר
            </a>
            {canShowWhatsapp && whatsappUrl && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noreferrer"
                className="yard-action-btn yard-action-whatsapp"
              >
                💬 וואטסאפ
              </a>
            )}
          </>
        ) : (
          <>
            <button disabled className="yard-action-btn yard-action-call" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              התקשר
            </button>
            <button disabled className="yard-action-btn yard-action-whatsapp" style={{ opacity: 0.5, cursor: 'not-allowed' }}>
              וואטסאפ
            </button>
          </>
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
      </div>
    </div>
  );
}

