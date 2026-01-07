import { useState, useEffect } from 'react';
import { resolveCarImageUrl } from '../../utils/carImageResolver';

export interface CarImageProps {
  src?: string;
  alt: string;
  width?: number; // Optional explicit width (for CLS prevention)
  height?: number; // Optional explicit height (for CLS prevention)
  loading?: 'lazy' | 'eager'; // Image loading strategy
  fetchPriority?: 'high' | 'low' | 'auto'; // fetchpriority for LCP optimization
}

export function CarImage({ src, alt, width, height, loading: loadingStrategy = 'lazy', fetchPriority }: CarImageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);

  // Resolve image URL (handles Storage paths)
  useEffect(() => {
    if (!src) {
      setResolvedSrc(null);
      setLoading(false);
      return;
    }

    // If already HTTPS, use directly
    if (src.startsWith('http://') || src.startsWith('https://')) {
      setResolvedSrc(src);
      setLoading(false);
      return;
    }

    // Resolve Storage path
    setLoading(true);
    resolveCarImageUrl(src)
      .then((resolved) => {
        setResolvedSrc(resolved);
        setLoading(false);
        if (!resolved) {
          setError(true);
        }
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[CarImage] Failed to resolve image:', err);
        }
        setResolvedSrc(null);
        setError(true);
        setLoading(false);
      });
  }, [src]);

  if (!src || !resolvedSrc) {
    return (
      <div className="image-error">
        {error ? 'שגיאה בטעינת תמונה' : 'אין תמונה זמינה'}
      </div>
    );
  }

  // Default dimensions for CLS prevention
  // Grid view: ~300x200 (1.5:1 ratio), List view: 200x150 (4:3 ratio)
  // Use provided dimensions or defaults that match container CSS
  const imgWidth = width || 300;
  const imgHeight = height || 200;

  return (
    <>
      {loading && !error && (
        <div className="image-skeleton" />
      )}
      <img
        src={resolvedSrc}
        alt={alt}
        width={imgWidth}
        height={imgHeight}
        loading={loadingStrategy}
        fetchPriority={fetchPriority}
        decoding="async"
        onLoad={() => setLoading(false)}
        onError={() => {
          setLoading(false);
          setError(true);
        }}
        style={{
          display: loading || error ? 'none' : 'block',
          aspectRatio: `${imgWidth} / ${imgHeight}`,
        }}
      />
      {error && (
        <div className="image-error">
          שגיאה בטעינת תמונה
        </div>
      )}
    </>
  );
}

