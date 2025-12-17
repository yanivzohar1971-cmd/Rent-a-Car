import { useState } from 'react';

export interface CarImageProps {
  src?: string;
  alt: string;
  width?: number; // Optional explicit width (for CLS prevention)
  height?: number; // Optional explicit height (for CLS prevention)
}

export function CarImage({ src, alt, width, height }: CarImageProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!src) {
    return (
      <div className="image-error">
        אין תמונה זמינה
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
        src={src}
        alt={alt}
        width={imgWidth}
        height={imgHeight}
        loading="lazy"
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

