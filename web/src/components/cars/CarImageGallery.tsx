import { useState, useEffect } from 'react';
import './CarImageGallery.css';

/**
 * Car Image Gallery Component
 * 
 * Reusable image gallery with:
 * - Large main image (16:9)
 * - Horizontal scrollable thumbnail strip
 * - Click to select thumbnail
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
}

/**
 * Internal component for main image with loading state
 */
function MainImage({ 
  src, 
  alt 
}: { 
  src?: string; 
  alt: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  // Reset state when src changes
  useEffect(() => {
    if (src) {
      setLoading(true);
      setError(false);
    }
  }, [src]);

  if (!src) {
    return (
      <div className="car-gallery-placeholder">
        אין תמונה זמינה
      </div>
    );
  }

  return (
    <>
      {loading && !error && (
        <div className="car-gallery-skeleton" />
      )}
      <img
        src={src}
        alt={alt}
        className="car-gallery-main-img"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        style={{
          display: loading || error ? 'none' : 'block'
        }}
      />
      {error && (
        <div className="car-gallery-error">
          שגיאה בטעינת תמונה
        </div>
      )}
    </>
  );
}

export default function CarImageGallery({
  imageUrls = [],
  mainImageUrl,
  altText = 'תמונת רכב',
  className = '',
  noImagesText = 'אין תמונות',
  maxHeight,
}: CarImageGalleryProps) {
  // Determine initial selected URL
  const getInitialUrl = (): string | undefined => {
    if (mainImageUrl) return mainImageUrl;
    if (imageUrls.length > 0) return imageUrls[0];
    return undefined;
  };

  const [selectedUrl, setSelectedUrl] = useState<string | undefined>(getInitialUrl);

  // Update selected when props change
  useEffect(() => {
    const initial = getInitialUrl();
    setSelectedUrl(initial);
  }, [imageUrls, mainImageUrl]);

  // Build the final list of URLs to display
  // Ensure mainImageUrl is first if provided and not already in the array
  const allUrls: string[] = (() => {
    const urls = [...imageUrls];
    if (mainImageUrl && !urls.includes(mainImageUrl)) {
      urls.unshift(mainImageUrl);
    }
    return urls.filter(Boolean);
  })();

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

  return (
    <div className={`car-gallery-container ${className}`}>
      {/* Main Image */}
      <div 
        className="car-gallery-main"
        style={maxHeight ? { maxHeight } : undefined}
      >
        <MainImage src={selectedUrl} alt={altText} />
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
    </div>
  );
}

