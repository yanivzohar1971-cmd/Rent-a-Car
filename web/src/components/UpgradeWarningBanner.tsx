/**
 * Upgrade Warning Banner Component
 * Soft, non-intrusive banner for showing usage/quota warnings
 */

import { useNavigate } from 'react-router-dom';
import type { UpgradeWarning } from '../utils/usageWarnings';
import './UpgradeWarningBanner.css';

interface UpgradeWarningBannerProps {
  warning: UpgradeWarning;
  onDismiss?: () => void; // Optional: allow dismissing the banner
}

export function UpgradeWarningBanner({ warning, onDismiss }: UpgradeWarningBannerProps) {
  const navigate = useNavigate();

  const handleUpgradeClick = () => {
    // Navigate to a plan/pricing page if exists, or account page
    // TODO: Update with actual plan page route if available
    navigate('/account');
  };

  const getBannerClass = () => {
    switch (warning.level) {
      case 'CRITICAL':
        return 'upgrade-warning-banner critical';
      case 'WARN':
        return 'upgrade-warning-banner warn';
      case 'INFO':
        return 'upgrade-warning-banner info';
      default:
        return 'upgrade-warning-banner info';
    }
  };

  const getIcon = () => {
    switch (warning.level) {
      case 'CRITICAL':
        return '⚠️';
      case 'WARN':
        return '⚠️';
      case 'INFO':
        return 'ℹ️';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div className={getBannerClass()}>
      <div className="upgrade-warning-content">
        <span className="upgrade-warning-icon">{getIcon()}</span>
        <span className="upgrade-warning-message">{warning.message}</span>
      </div>
      <div className="upgrade-warning-actions">
        {warning.recommendedPlan && (
          <button
            type="button"
            className="upgrade-warning-cta"
            onClick={handleUpgradeClick}
          >
            שדרג חבילה
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            className="upgrade-warning-dismiss"
            onClick={onDismiss}
            aria-label="סגור"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}

