import { useState, useEffect, useLayoutEffect, type CSSProperties } from 'react';
import {
  resolveCarImageUrl,
  normalizeCarImageRef,
  isAbsoluteHttpImageUrl,
} from '../../utils/carImageResolver';

export interface CarImageProps {
  src?: string;
  alt: string;
  width?: number; // Optional explicit width (for CLS prevention)
  height?: number; // Optional explicit height (for CLS prevention)
  loading?: 'lazy' | 'eager'; // Image loading strategy
  fetchPriority?: 'high' | 'low' | 'auto'; // fetchpriority for LCP optimization
}

function parseCarImageSrc(src: string | undefined): { trimmed: string; directHttpUrl: string | null } {
  const trimmed = normalizeCarImageRef(typeof src === 'string' ? src : '');
  if (!trimmed) {
    return { trimmed: '', directHttpUrl: null };
  }
  if (isAbsoluteHttpImageUrl(trimmed)) {
    return { trimmed, directHttpUrl: trimmed };
  }
  return { trimmed, directHttpUrl: null };
}

export function CarImage({ src, alt, width, height, loading: loadingStrategy = 'lazy', fetchPriority }: CarImageProps) {
  const { trimmed, directHttpUrl } = parseCarImageSrc(src);
  const [resolvedStorageUrl, setResolvedStorageUrl] = useState<string | null>(null);
  const [resolveFailed, setResolveFailed] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  // Drop stale storage resolution before paint when src changes (avoids wrong thumbnail + bad loading UI).
  useLayoutEffect(() => {
    setImgBroken(false);
    setResolveFailed(false);
    if (!trimmed) {
      setResolvedStorageUrl(null);
      return;
    }
    if (directHttpUrl) {
      setResolvedStorageUrl(null);
      return;
    }
    setResolvedStorageUrl(null);
  }, [trimmed, directHttpUrl]);

  useEffect(() => {
    if (!trimmed || directHttpUrl) {
      return;
    }

    let cancelled = false;
    resolveCarImageUrl(trimmed)
      .then((resolved) => {
        if (cancelled) return;
        setResolvedStorageUrl(resolved);
        if (!resolved) {
          setResolveFailed(true);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          console.warn('[CarImage] Failed to resolve image:', err);
        }
        setResolvedStorageUrl(null);
        setResolveFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [trimmed, directHttpUrl]);

  const displayUrl = directHttpUrl ?? resolvedStorageUrl;

  useEffect(() => {
    setImgBroken(false);
  }, [displayUrl]);

  // Default dimensions for CLS prevention
  // Grid view: ~300x200 (1.5:1 ratio), List view: 200x150 (4:3 ratio)
  // Use provided dimensions or defaults that match container CSS
  const imgWidth = width || 300;
  const imgHeight = height || 200;

  // Fill the parent image slot (e.g. .car-image height: 200px). Do not use aspect-ratio here —
  // wide cards would compute a taller box and overflow past the fixed slot.
  const fillFrame: CSSProperties = {
    width: '100%',
    height: '100%',
    minHeight: 200,
    boxSizing: 'border-box',
  };

  const imgShell: CSSProperties = {
    ...fillFrame,
    overflow: 'hidden',
    position: 'relative',
  };

  if (!trimmed) {
    return (
      <div className="image-error" style={fillFrame}>
        אין תמונה זמינה
      </div>
    );
  }

  if (!directHttpUrl && !resolvedStorageUrl && !resolveFailed) {
    return <div className="image-skeleton" style={fillFrame} />;
  }

  if (!displayUrl || resolveFailed) {
    return (
      <div className="image-error" style={fillFrame}>
        {resolveFailed ? 'שגיאה בטעינת תמונה' : 'אין תמונה זמינה'}
      </div>
    );
  }

  if (imgBroken) {
    return (
      <div className="image-error" style={fillFrame}>
        שגיאה בטעינת תמונה
      </div>
    );
  }

  return (
    <div className="car-image-frame" style={imgShell}>
      <img
        src={displayUrl}
        alt={alt}
        width={imgWidth}
        height={imgHeight}
        loading={loadingStrategy}
        fetchPriority={fetchPriority}
        decoding="async"
        onError={() => setImgBroken(true)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  );
}
