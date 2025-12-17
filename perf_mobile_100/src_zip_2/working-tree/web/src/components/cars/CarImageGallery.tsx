import { useState, useEffect, useCallback } from 'react';
import './CarImageGallery.css';

/**
 * Car Image Gallery Component
 * 
 * Reusable image gallery with:
 * - Large main image (16:9)
 * - Horizontal scrollable thumbnail strip
 * - Click to select thumbnail
 * - Zoom overlay on main image click
 * - Placeholder when no images
 * 
 * Used by:
 * - CarDetailsPage (public car view)
 * - YardFleetPage (car preview dialog)
 */

export interface CarImageGalleryProps {
  /** Array of image URLs to display */
  imageUrls?: string[];
  /** Main image URL (used as initial selection if provided) */
  mainImageUrl?: string;
  /** Alt text for images */
  altText?: string;
  /** Additional CSS class */
  className?: string;
  /** Placeholder text when no images (default: "אין תמונות") */
  noImagesText?: string;
  /** Max height for main image container */
  maxHeight?: string;
  /** Enable zoom overlay on main image click (default: true) */
  enableZoom?: boolean;
}

export default function CarImageGallery({
  imageUrls = [],
  mainImageUrl,
  altText = 'תמונת רכב',
  className = '',
  noImagesText = 'אין תמונות',
  maxHeight,
  enableZoom = true,
}: CarImageGalleryProps) {
  // Determine initial selected URL based on props
  const getInitialUrl = useCallback((): string | undefined => {
    const urls = imageUrls ?? [];
    // Prefer mainImageUrl if it exists and is in the list
    if (mainImageUrl && urls.includes(mainImageUrl)) {
      return mainImageUrl;
    }
    // Otherwise prefer mainImageUrl if provided
    if (mainImageUrl) {
      return mainImageUrl;
    }
    // Fallback to first image
    if (urls.length > 0) {
      return urls[0];
    }
    return undefined;
  }, [imageUrls, mainImageUrl]);

  const [selectedUrl, setSelectedUrl] = useState<string | undefined>(getInitialUrl);
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  // Update selected when props change - robust selection logic
  useEffect(() => {
    const urls = imageUrls ?? [];
    if (urls.length === 0 && !mainImageUrl) {
      setSelectedUrl(undefined);
      return;
    }

    // Prefer mainImageUrl if present and included in the list
    if (mainImageUrl && urls.includes(mainImageUrl)) {
      setSelectedUrl(mainImageUrl);
      return;
    }

    // If mainImageUrl is provided but not in list, still use it
    if (mainImageUrl) {
      setSelectedUrl(mainImageUrl);
      return;
    }

    // If current selection is invalid/missing, fall back to first image
    if (!selectedUrl || !urls.includes(selectedUrl)) {
      setSelectedUrl(urls[0]);
    }
    // Note: selectedUrl intentionally not in deps to avoid loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrls, mainImageUrl]);

  // Handle ESC key to close zoom
  useEffect(() => {
    if (!isZoomOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsZoomOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isZoomOpen]);

  // Build the final list of URLs to display
  // Ensure mainImageUrl is first if provided and not already in the array
  const allUrls: string[] = (() => {
    const urls = [...(imageUrls ?? [])];
    if (mainImageUrl && !urls.includes(mainImageUrl)) {
      urls.unshift(mainImageUrl);
    }
    return urls.filter(Boolean);
  })();

  // Handle main image click for zoom
  const handleMainImageClick = () => {
    if (enableZoom && selectedUrl) {
      setIsZoomOpen(true);
    }
  };

  // No images case
  if (allUrls.length === 0) {
    return (
      <div className={`car-gallery-container car-gallery-empty ${className}`}>
        <div className="car-gallery-no-images">
          <span className="car-gallery-no-images-icon">📷</span>
          <span className="car-gallery-no-images-text">{noImagesText}</span>
        </div>
      </div>
    );
  }

  const hasImages = allUrls.length > 0;
  const hasSelectedImage = !!selectedUrl;

  return (
    <div className={`car-gallery-container ${className}`}>
      {/* Main Image */}
      <div 
        className="car-gallery-main"
        style={maxHeight ? { maxHeight } : undefined}
      >
        {hasImages && hasSelectedImage ? (
          <div
            className={`car-gallery-main-zoomable ${enableZoom ? 'car-gallery-main-zoomable--active' : ''}`}
            onClick={handleMainImageClick}
            role={enableZoom ? 'button' : undefined}
            tabIndex={enableZoom ? 0 : undefined}
            onKeyDown={(e) => {
              if (enableZoom && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                setIsZoomOpen(true);
              }
            }}
          >
            <img
              src={selectedUrl}
              alt={altText || 'תמונת רכב'}
              className="car-gallery-main-image"
            />
            {enableZoom && (
              <div className="car-gallery-zoom-hint" aria-hidden="true">
                🔍
              </div>
            )}
          </div>
        ) : (
          <div className="car-gallery-main-placeholder">
            <span className="car-gallery-no-images-icon">📷</span>
            <span className="car-gallery-no-images-text">{noImagesText}</span>
          </div>
        )}
      </div>

      {/* Thumbnail Strip - only show if more than 1 image */}
      {allUrls.length > 1 && (
        <div className="car-gallery-thumbnails">
          {allUrls.map((url, index) => (
            <button
              key={`${url}-${index}`}
              type="button"
              className={`car-gallery-thumb ${url === selectedUrl ? 'car-gallery-thumb-selected' : ''}`}
              onClick={() => setSelectedUrl(url)}
              aria-label={`תמונה ${index + 1}`}
            >
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {/* Zoom Overlay */}
      {isZoomOpen && selectedUrl && (
        <div
          className="car-gallery-zoom-overlay"
          onClick={() => setIsZoomOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="תמונה מוגדלת"
        >
          <div
            className="car-gallery-zoom-content"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="car-gallery-zoom-close"
              onClick={() => setIsZoomOpen(false)}
              aria-label="סגור"
            >
              ×
            </button>
            <img
              src={selectedUrl}
              alt={altText || 'תמונה מוגדלת'}
              className="car-gallery-zoom-image"
            />
          </div>
        </div>
      )}
    </div>
  );
}

