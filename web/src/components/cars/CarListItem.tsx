import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import type { PublicSearchResultItem } from '../../types/PublicSearchResult';
import { FavoriteHeart } from './FavoriteHeart';
import { CarImage } from './CarImage';
import { isRecommendedYard } from '../../utils/yardPromotionHelpers';
import { PROMO_PROOF_MODE } from '../../config/flags';
import { formatTimeRemaining, getPromotionTier, calculatePromotionScore } from '../../utils/promotionProofHelpers';
import { useAuth } from '../../context/AuthContext';
import type { PromotionUntil } from '../../utils/promotionTime';
import { getActivePromotionTier, getPromotionTierTheme, resolveMaterialFromPromotionTier } from '../../utils/promotionTierTheme';
import { usePromoTheme } from '../../hooks/usePromoTheme';
import { resolveSellerBadgeText, getSellerLogoUrl } from '../../utils/sellerBadge';
import { subscribeFeatureFlags } from '../../api/featureFlagsApi';
import { SmartCopyButton } from '../common/SmartCopyButton';
import './CarListItem.css';

export interface CarListItemProps {
  car: PublicSearchResultItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  carLink: string;
  formatPrice: (price: number) => string;
  isPromotionActive: (until: PromotionUntil) => boolean;
  rankIndex?: number; // 1-based rank in current search results (proof mode only)
  totalResults?: number; // Total results count (proof mode only)
}

export function CarListItem({
  car,
  isFavorite,
  onToggleFavorite,
  carLink,
  formatPrice,
  isPromotionActive,
  rankIndex,
  totalResults,
}: CarListItemProps) {
  const { userProfile } = useAuth();
  const isProofMode = PROMO_PROOF_MODE && (userProfile?.isYard || userProfile?.isAdmin);
  const { resolvePromoAssets } = usePromoTheme();
  
  // Debug feature flags
  const [debugOverlayEnabled, setDebugOverlayEnabled] = useState(false);
  const [debugButtonEnabled, setDebugButtonEnabled] = useState(false);
  const [debugModalOpen, setDebugModalOpen] = useState(false);
  
  useEffect(() => {
    const unsubscribe = subscribeFeatureFlags((flags) => {
      setDebugOverlayEnabled(flags.enablePublicCarDebugOverlay);
      setDebugButtonEnabled(flags.enablePublicCarDebugButton);
    });
    return () => unsubscribe();
  }, []);
  
  // Compute promotion flags using contract labels
  const isDiamond = car.promotion?.diamondUntil && isPromotionActive(car.promotion.diamondUntil);
  const isPlatinum = car.promotion?.platinumUntil && isPromotionActive(car.promotion.platinumUntil);
  const isHighlighted = car.promotion?.highlightUntil && isPromotionActive(car.promotion.highlightUntil);
  const isBoosted = car.promotion?.boostUntil && isPromotionActive(car.promotion.boostUntil);
  const isExposurePlus = car.promotion?.exposurePlusUntil && isPromotionActive(car.promotion.exposurePlusUntil);
  const isRecommendedYardFlag = isRecommendedYard(car.yardPromotion);
  
  // Check if stripes should be shown (only for PLATINUM or DIAMOND with showStripes flag)
  const hasStripes = Boolean(
    car.promotion?.showStripes &&
    (isPlatinum || isDiamond)
  );
  
  // Get active promotion tier for background theme
  const activeTier = getActivePromotionTier(car.promotion, isPromotionActive);
  const tierTheme = getPromotionTierTheme(activeTier);
  
  // Build className with promotion states
  // Include 'car-card' as base class for promo styling consistency
  const className = [
    'car-card',
    'car-list-item',
    'card',
    isDiamond ? 'is-diamond' : '',
    isPlatinum ? 'is-platinum' : '',
    isHighlighted ? 'is-highlighted' : '',
    isBoosted ? 'is-boosted' : '',
    isExposurePlus ? 'is-exposure-plus' : '',
    hasStripes ? 'has-stripes' : '',
  ].filter(Boolean).join(' ');
  
  // Get material from active tier for background images
  const promoMaterial = resolveMaterialFromPromotionTier(activeTier);
  
  // CSS variables for tier background images
  // Use AVIF files with PNG fallback via CSS image-set for desktop/mobile switching
  // Or CSS gradients when mode === "CSS"
  const cardStyle: React.CSSProperties & Record<string, string> = {};
  if (tierTheme) {
    cardStyle['--promo-accent'] = tierTheme.accent;
  }
  // If we have a material, resolve assets based on current mode (CSS or images)
  if (promoMaterial) {
    const assets = resolvePromoAssets(promoMaterial, 'bg-desktop');
    Object.assign(cardStyle, assets);
  }
  
  // Fallback to first imageUrl if mainImageUrl is missing
  const cardSrc = car.mainImageUrl || (car.imageUrls && car.imageUrls.length > 0 ? car.imageUrls[0] : undefined);

  // Build debug JSON protocol (client-side only, no admin callables)
  // CRITICAL: Use item.* fields (what the card actually receives), not car.*
  const buildDebugJson = () => {
    const itemAny = car as any;
    // Read from item's nested snapshots (passed through from mapper)
    const yardSnap = car.yardSnapshot && typeof car.yardSnapshot === 'object' ? car.yardSnapshot : null;
    const sellerSnap = car.sellerSnapshot && typeof car.sellerSnapshot === 'object' ? car.sellerSnapshot : null;
    
    // viewsCount: use item.viewsCount (already mapped from publicCars)
    const viewsValue = typeof car.viewsCount === 'number' ? car.viewsCount : (car.viewsCount ?? 0);
    
    // Check if exposure flags are available on the item (from publicCars)
    const hasExposureFlags = 
      'showNameInBadge' in itemAny || 
      'showLogo' in itemAny || 
      'showPhone' in itemAny || 
      'showWhatsapp' in itemAny ||
      'showCity' in itemAny ||
      'showAddress' in itemAny;
    
    return {
      carId: car.id,
      yardUid: car.yardUid || null,
      sellerType: car.sellerType || null,
      views: {
        cardValue: viewsValue,
        rawPublicCarValue: viewsValue, // Same as cardValue since we're using the mapped item
        isMissing: viewsValue === 0 || viewsValue === null || viewsValue === undefined,
      },
      snapshots: {
        hasSellerSnapshot: Boolean(
          car.sellerDisplayName || 
          car.sellerLogoUrl ||
          sellerSnap?.sellerName ||
          sellerSnap?.sellerLogoUrl
        ),
        hasYardSnapshot: Boolean(
          car.yardName || 
          car.yardDisplayName || 
          car.yardLogoUrl ||
          yardSnap?.yardName ||
          yardSnap?.yardLogoUrl
        ),
        sellerSnapshot: sellerSnap ? {
          sellerName: sellerSnap.sellerName || null,
          sellerPhone: sellerSnap.sellerPhone || null,
          sellerWhatsapp: sellerSnap.sellerWhatsapp || null,
          sellerLogoUrl: sellerSnap.sellerLogoUrl || null,
        } : null,
        yardSnapshot: yardSnap ? {
          yardName: yardSnap.yardName || null,
          yardPhone: yardSnap.yardPhone || null,
          yardWhatsapp: yardSnap.yardWhatsapp || null,
          yardLogoUrl: yardSnap.yardLogoUrl || null,
          yardAddress: yardSnap.yardAddress || null,
          yardCity: yardSnap.yardCity || null,
        } : null,
      },
      exposure: {
        exposureKnown: hasExposureFlags, // NEW: indicates if exposure flags are available
        showNameInBadge: itemAny.showNameInBadge !== undefined ? itemAny.showNameInBadge : null,
        showLogo: itemAny.showLogo !== undefined ? itemAny.showLogo : null,
        showPhone: itemAny.showPhone !== undefined ? itemAny.showPhone : null,
        showWhatsapp: itemAny.showWhatsapp !== undefined ? itemAny.showWhatsapp : null,
        showCity: itemAny.showCity !== undefined ? itemAny.showCity : null,
        showAddress: itemAny.showAddress !== undefined ? itemAny.showAddress : null,
      },
      dataHints: {
        hasYardDisplayName: Boolean(car.yardDisplayName || car.yardName),
        hasYardLogoUrl: Boolean(car.yardLogoUrl),
        hasSellerDisplayName: Boolean(car.sellerDisplayName),
        hasSellerLogoUrl: Boolean(car.sellerLogoUrl),
      },
    };
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* 🐞 DEBUG Button (if flag enabled) - positioned at RIGHT edge (top-right in RTL), not overlapping heart */}
      {debugButtonEnabled && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDebugModalOpen(true);
          }}
          style={{
            position: 'absolute',
            top: '0.5rem',
            right: '0.5rem', // RIGHT edge (RTL: top-right)
            zIndex: 10,
            background: '#2f80ed',
            color: '#ffffff',
            border: 'none',
            borderRadius: '6px',
            padding: '0.375rem 0.75rem',
            fontSize: '0.75rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
            fontFamily: 'Heebo, sans-serif',
          }}
          title="Debug card data"
        >
          🐞 DEBUG
        </button>
      )}
      
      {/* DEBUG Modal */}
      {debugModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={() => setDebugModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              padding: '1.5rem',
              maxWidth: '90vw',
              maxHeight: '90vh',
              overflow: 'auto',
              boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Card Debug Data</h3>
              <button
                onClick={() => setDebugModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.25rem 0.5rem',
                }}
              >
                ×
              </button>
            </div>
            <div style={{ marginBottom: '1rem' }}>
              <SmartCopyButton
                getValue={buildDebugJson}
                mode="json"
                label="🗐 COPY JSON"
                variant="admin"
                size="sm"
              />
            </div>
            <pre
              style={{
                background: '#f5f5f5',
                padding: '1rem',
                borderRadius: '8px',
                overflow: 'auto',
                fontSize: '0.875rem',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(buildDebugJson(), null, 2)}
            </pre>
          </div>
        </div>
      )}
      
      <Link to={carLink} className={className} style={cardStyle}>
      <div className="car-list-item-content">
        {/* Right side: Image */}
        <div className="car-list-image">
          <CarImage src={cardSrc} alt={car.title} />
        </div>

        {/* Center: Main content */}
        <div className="car-list-main">
          <div className="car-list-header" style={{ position: 'relative' }}>
            <h3 className={`car-list-title ${isHighlighted ? 'is-highlighted-title' : ''} ${isExposurePlus ? 'is-exposure-plus-title' : ''}`}>
              {car.title}
            </h3>
            {/* Proof mode: rank display */}
            {isProofMode && rankIndex !== undefined && totalResults !== undefined && (
              <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
                Rank #{rankIndex} / {totalResults}
              </div>
            )}
            {/* Proof mode: promotion debug info */}
            {isProofMode && car.promotion && (
              <div style={{ fontSize: '0.7rem', color: '#888', marginBottom: '0.5rem', fontFamily: 'monospace' }}>
                <div>Promo: tier={getPromotionTier(car.promotion)} | score={calculatePromotionScore(car.promotion)}</div>
                {car.promotion.boostUntil && (
                  <div>Boost: {formatTimeRemaining(car.promotion.boostUntil)}</div>
                )}
                {car.promotion.highlightUntil && (
                  <div>Highlight: {formatTimeRemaining(car.promotion.highlightUntil)}</div>
                )}
                {/* bumpedAt property not available in CarPromotionState type */}
              </div>
            )}
            <div className="car-list-badges">
              {isRecommendedYardFlag && (
                <span className="promotion-badge recommended-yard">מגרש מומלץ</span>
              )}
              <span className={`seller-type-badge ${car.sellerType === 'YARD' ? 'yard' : car.sellerType === 'AGENT' ? 'agent' : 'private'}`}>
                {(() => {
                  const logoUrl = getSellerLogoUrl(car);
                  const badgeText = resolveSellerBadgeText(car);
                  return (
                    <>
                      {logoUrl && (
                        <img 
                          src={logoUrl} 
                          alt={badgeText}
                          className="seller-badge-logo"
                          onError={(e) => {
                            // Hide logo on error, show text only
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      )}
                      <span>{badgeText}</span>
                    </>
                  );
                })()}
              </span>
              {(() => {
                const views = Number.isFinite(car.viewsCount) ? (car.viewsCount ?? 0) : 0;
                return (
                  <span className="views-badge" title={`${views.toLocaleString('he-IL')} צפיות`}>
                    צפיות: {views.toLocaleString('he-IL')}
                  </span>
                );
              })()}
              {/* Debug overlay: snapshot and views status indicator */}
              {debugOverlayEnabled && car.sellerType !== 'PRIVATE' && (() => {
                // Check for snapshot fields that indicate seller/yard data was captured
                // Check both flat fields and nested snapshots
                const carAny = car as any;
                const yardSnap = carAny.yardSnapshot && typeof carAny.yardSnapshot === 'object' ? carAny.yardSnapshot : null;
                const sellerSnap = carAny.sellerSnapshot && typeof carAny.sellerSnapshot === 'object' ? carAny.sellerSnapshot : null;
                
                const hasSellerSnapshot = Boolean(
                  car.sellerDisplayName || 
                  car.sellerLogoUrl ||
                  sellerSnap?.sellerName ||
                  sellerSnap?.sellerLogoUrl
                );
                const hasYardSnapshot = Boolean(
                  car.yardName || 
                  car.yardDisplayName || 
                  car.yardLogoUrl ||
                  yardSnap?.yardName ||
                  yardSnap?.yardLogoUrl
                );
                const snapshotOk = hasSellerSnapshot || hasYardSnapshot;
                
                // Check views status
                const viewsValue = Number.isFinite(car.viewsCount) ? (car.viewsCount ?? 0) : 0;
                const viewsOk = viewsValue > 0;
                
                return (
                  <>
                    <span 
                      className={`debug-snapshot-badge ${snapshotOk ? 'ok' : 'missing'}`}
                      title={snapshotOk ? '✓ Snapshot data present' : '✗ Snapshot data missing'}
                    >
                      {snapshotOk ? '✓ SNAPSHOT' : '✗ NO SNAPSHOT'}
                    </span>
                    <span 
                      className={`debug-snapshot-badge ${viewsOk ? 'ok' : 'missing'}`}
                      title={viewsOk ? '✓ Views count present' : '✗ Views count missing or zero'}
                    >
                      {viewsOk ? '✓ VIEWS' : '✗ NO VIEWS'}
                    </span>
                  </>
                );
              })()}
            </div>
          </div>

          {/* Subline - version/engine (placeholder for now) */}
          <div className="car-list-subline">
            {/* Can be enhanced with actual version/engine data if available */}
          </div>

          {/* Metadata row */}
          <div className="car-list-metadata">
            {car.year && <span className="car-list-meta-item">שנה: {car.year}</span>}
            {car.mileageKm !== undefined && (
              <span className="car-list-meta-item">ק״מ: {car.mileageKm.toLocaleString('he-IL')}</span>
            )}
            {car.city && <span className="car-list-meta-item">מיקום: {car.city}</span>}
          </div>

          {/* Tags row */}
          <div className="car-list-tags">
            {/* Placeholder tags - can be enhanced with actual car features */}
            {/* Example tags: "חשמלי", "גלגלי מגנזיום", "בקרת שיוט אדפטיבית" */}
          </div>
        </div>

        {/* Left side: Price and Heart */}
        <div className="car-list-right">
          <div className={`car-list-price ${isExposurePlus ? 'is-exposure-plus-price' : ''}`}>
            {car.price ? formatPrice(car.price) : 'מחיר לפי בקשה'} ₪
          </div>
          <div className="car-list-heart">
            <FavoriteHeart
              isFavorite={isFavorite}
              onToggle={onToggleFavorite}
            />
          </div>
        </div>
      </div>
      </Link>
    </div>
  );
}

