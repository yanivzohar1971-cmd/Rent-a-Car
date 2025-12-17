/**
 * Car Card Skeleton - Matches exact geometry of real car cards
 * Used during loading to prevent footer push-down CLS
 */

import './CarCardSkeleton.css';
import '../cars/CarListItem.css'; // Import list styles for list view skeleton

interface CarCardSkeletonProps {
  viewMode: 'gallery' | 'list';
}

export function CarCardSkeleton({ viewMode }: CarCardSkeletonProps) {
  if (viewMode === 'list') {
    return (
      <div className="car-list-item car-card-skeleton">
        <div className="car-list-item-content">
          <div className="car-list-image">
            <div className="image-skeleton" />
          </div>
          <div className="car-list-main">
            <div className="car-list-header">
              <div className="car-list-title skeleton-text" style={{ width: '60%', height: '1.95rem' }} />
              <div className="car-list-badges">
                <div className="skeleton-badge" style={{ width: '80px', height: '1.5rem' }} />
              </div>
            </div>
            <div className="car-list-subline skeleton-text" style={{ width: '40%', height: '1.25rem' }} />
            <div className="car-list-metadata">
              <div className="skeleton-text" style={{ width: '100px', height: '0.9375rem' }} />
              <div className="skeleton-text" style={{ width: '80px', height: '0.9375rem' }} />
            </div>
          </div>
          <div className="car-list-right">
            <div className="car-list-price skeleton-text" style={{ width: '120px', height: '1.95rem' }} />
          </div>
        </div>
      </div>
    );
  }

  // Gallery view skeleton
  return (
    <div className="car-card car-card-skeleton">
      <div className="car-image">
        <div className="image-skeleton" />
      </div>
      <div className="car-info">
        <div className="car-header-row">
          <div className="car-title skeleton-text" style={{ width: '70%', height: '1.625rem' }} />
          <div className="car-badges">
            <div className="skeleton-badge" style={{ width: '60px', height: '1.5rem' }} />
          </div>
        </div>
        <div className="car-price skeleton-text" style={{ width: '100px', height: '1.625rem' }} />
        <div className="car-km skeleton-text" style={{ width: '80px', height: '0.9375rem' }} />
        <div className="car-location skeleton-text" style={{ width: '100px', height: '0.9375rem' }} />
        <div className="car-view-button-wrapper skeleton-button" style={{ height: '2.5rem' }} />
      </div>
    </div>
  );
}
