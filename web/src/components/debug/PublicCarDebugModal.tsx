import { SmartCopyButton } from '../common/SmartCopyButton';
import './PublicCarDebugModal.css';

interface PublicCarDebugModalProps {
  car: any;
  isOpen: boolean;
  onClose: () => void;
}

export default function PublicCarDebugModal({ car, isOpen, onClose }: PublicCarDebugModalProps) {
  if (!isOpen) return null;

  // Check for seller/yard snapshot fields
  const hasSellerSnapshot = Boolean(
    car?.sellerName || 
    car?.sellerPhone || 
    car?.sellerWhatsapp || 
    car?.sellerLogoUrl
  );

  const hasYardSnapshot = Boolean(
    car?.yardName || 
    car?.yardPhone || 
    car?.yardWhatsapp || 
    car?.yardLogoUrl ||
    car?.yardAddress
  );

  const debugData = {
    carId: car?.id,
    sellerType: car?.sellerType,
    yardUid: car?.yardUid,
    sellerUid: car?.sellerUid,
    hasSellerSnapshot,
    hasYardSnapshot,
    sellerSnapshot: {
      sellerName: car?.sellerName || null,
      sellerPhone: car?.sellerPhone || null,
      sellerWhatsapp: car?.sellerWhatsapp || null,
      sellerLogoUrl: car?.sellerLogoUrl || null,
    },
    yardSnapshot: {
      yardName: car?.yardName || null,
      yardPhone: car?.yardPhone || null,
      yardWhatsapp: car?.yardWhatsapp || null,
      yardLogoUrl: car?.yardLogoUrl || null,
      yardAddress: car?.yardAddress || null,
    },
    // NEW: Show snapshot diagnostic fields if present
    yardSnapshotSource: car?.yardSnapshotSource || 'unknown',
    yardSnapshotMissing: car?.yardSnapshotMissing || [],
    publishedAt: car?.publishedAt,
    updatedAt: car?.updatedAt,
  };

  return (
    <div className="debug-modal-overlay" onClick={onClose}>
      <div className="debug-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="debug-modal-header">
          <h2>🔍 DEBUG מוכר/מגרש</h2>
          <button className="debug-modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="debug-modal-body">
          <div className="debug-status-section">
            <h3>Snapshot Status</h3>
            <div className="debug-status-grid">
              <div className={`debug-status-badge ${hasSellerSnapshot ? 'ok' : 'missing'}`}>
                Seller Snapshot: {hasSellerSnapshot ? '✓ OK' : '✗ MISSING'}
              </div>
              <div className={`debug-status-badge ${hasYardSnapshot ? 'ok' : 'missing'}`}>
                Yard Snapshot: {hasYardSnapshot ? '✓ OK' : '✗ MISSING'}
              </div>
            </div>
            {car?.yardSnapshotSource && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: '#666' }}>
                <strong>Source:</strong> {car.yardSnapshotSource}
                {car.yardSnapshotMissing && car.yardSnapshotMissing.length > 0 && (
                  <span style={{ marginLeft: '12px' }}>
                    <strong>Missing:</strong> {car.yardSnapshotMissing.join(', ')}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="debug-data-section">
            <div className="debug-section-header">
              <h3>Debug Data (publicCar fields)</h3>
              <SmartCopyButton mode="json" getValue={async () => debugData} label="Copy JSON" />
            </div>
            <pre className="debug-json-viewer">{JSON.stringify(debugData, null, 2)}</pre>
          </div>

          {!hasSellerSnapshot && car?.sellerType !== 'PRIVATE' && (
            <div className="debug-warning-box">
              <strong>⚠️ Warning:</strong> Seller snapshot is missing. Contact details may not display correctly.
            </div>
          )}

          {!hasYardSnapshot && car?.yardUid && (
            <div className="debug-warning-box">
              <strong>⚠️ Warning:</strong> Yard snapshot is missing. Yard info may not display correctly.
            </div>
          )}
        </div>

        <div className="debug-modal-footer">
          <button className="debug-modal-btn-close" onClick={onClose}>סגור</button>
        </div>
      </div>
    </div>
  );
}
