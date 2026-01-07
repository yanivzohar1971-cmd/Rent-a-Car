/**
 * YardCard - Displays yard branding and contact information on car details page
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { loadYardProfileByUid, type YardProfileData } from '../../api/yardProfileApi';
import './YardCard.css';

interface YardCardProps {
  yardUid?: string | null;
}

export default function YardCard({ yardUid }: YardCardProps) {
  const [yardProfile, setYardProfile] = useState<YardProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!yardUid) {
      setLoading(false);
      return;
    }

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
  }, [yardUid]);

  if (loading) {
    return (
      <div className="yard-card">
        <div className="yard-card-loading">טוען פרטי מגרש...</div>
      </div>
    );
  }

  if (!yardProfile || !yardUid) {
    return null;
  }

  const yardName = yardProfile.displayName || 'מגרש רכבים';
  const phone = yardProfile.phone || yardProfile.secondaryPhone;
  const hasLocation = yardProfile.yardLocationLat && yardProfile.yardLocationLng;

  // Build WhatsApp URL
  const whatsappPhone = phone?.replace(/[^0-9]/g, '');
  const whatsappUrl = whatsappPhone ? `https://wa.me/972${whatsappPhone.replace(/^0/, '')}` : null;

  // Build navigation URL
  const navigationUrl = hasLocation
    ? `https://www.google.com/maps?q=${yardProfile.yardLocationLat},${yardProfile.yardLocationLng}`
    : yardProfile.yardMapsUrl || null;

  return (
    <div className="yard-card">
      <div className="yard-card-header">
        {yardProfile.yardLogoUrl ? (
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
            <span className="yard-label">מגרש</span>
          </div>
          {(yardProfile.address || yardProfile.city) && (
            <div className="yard-location">
              {yardProfile.address && <span>{yardProfile.address}</span>}
              {yardProfile.address && yardProfile.city && <span className="location-separator">, </span>}
              {yardProfile.city && <span>{yardProfile.city}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="yard-card-actions">
        {phone && (
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

