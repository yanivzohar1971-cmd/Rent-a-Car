/**
 * LicensePlateBadge - Displays car license plate number as an Israeli-style badge
 * 
 * RTL-safe badge styled like an Israeli license plate with IL stripe and plate number.
 */

import './LicensePlateBadge.css';

interface LicensePlateBadgeProps {
  plate?: string | null;
  size?: 'sm' | 'md';
  className?: string;
}

export default function LicensePlateBadge({ plate, size = 'sm', className = '' }: LicensePlateBadgeProps) {
  if (!plate || plate.trim() === '') {
    return null;
  }

  return (
    <span className={`license-plate-badge license-plate-badge-${size} ${className}`}>
      <span className="license-plate-stripe">
        <span className="license-plate-il">IL</span>
      </span>
      <span className="license-plate-body">
        <span className="license-plate-number">{plate.trim()}</span>
      </span>
    </span>
  );
}

