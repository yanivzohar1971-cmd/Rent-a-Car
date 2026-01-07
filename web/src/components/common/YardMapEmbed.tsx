/**
 * YardMapEmbed - Displays Google Maps embed for yard location
 * 
 * Shows an iframe map preview with buttons to open in Google Maps or Waze.
 * Supports coordinates (lat/lng) or mapsLink URL.
 */

import './YardMapEmbed.css';

interface YardMapEmbedProps {
  latitude?: number | null;
  longitude?: number | null;
  mapsLink?: string | null;
}

export default function YardMapEmbed({ latitude, longitude, mapsLink }: YardMapEmbedProps) {
  // Validate coordinates
  const lat = typeof latitude === 'number' ? latitude : (latitude ? Number(latitude) : NaN);
  const lng = typeof longitude === 'number' ? longitude : (longitude ? Number(longitude) : NaN);
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng);
  
  // Validate mapsLink
  const hasMapsLink = typeof mapsLink === 'string' && mapsLink.trim().length > 0 && 
                      (mapsLink.trim().startsWith('http://') || mapsLink.trim().startsWith('https://'));

  // Build iframe URL
  let iframeUrl: string | null = null;
  if (hasCoords) {
    // Use coordinates for embed
    iframeUrl = `https://www.google.com/maps?q=${lat},${lng}&z=16&output=embed`;
  } else if (hasMapsLink) {
    // Try to extract coordinates from mapsLink, or use it directly
    const trimmedLink = mapsLink.trim();
    // Check if it's a Google Maps URL with coordinates
    const coordMatch = trimmedLink.match(/[?&]q=([+-]?\d+\.?\d*),([+-]?\d+\.?\d*)/);
    if (coordMatch) {
      const extractedLat = Number(coordMatch[1]);
      const extractedLng = Number(coordMatch[2]);
      if (Number.isFinite(extractedLat) && Number.isFinite(extractedLng)) {
        iframeUrl = `https://www.google.com/maps?q=${extractedLat},${extractedLng}&z=16&output=embed`;
      } else {
        // Fallback: use the link directly (may not work for all Google Maps URLs)
        iframeUrl = trimmedLink.includes('output=embed') ? trimmedLink : `${trimmedLink}&output=embed`;
      }
    } else {
      // Not a coordinate-based URL, try to use it as-is
      iframeUrl = trimmedLink.includes('output=embed') ? trimmedLink : `${trimmedLink}&output=embed`;
    }
  }

  // Build action button URLs
  const googleMapsUrl = hasCoords 
    ? `https://www.google.com/maps?q=${lat},${lng}`
    : (hasMapsLink ? mapsLink!.trim() : null);
  
  const wazeUrl = hasCoords
    ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`
    : null; // Waze requires coordinates, can't use a generic mapsLink

  // Show placeholder if no location data
  if (!hasCoords && !hasMapsLink) {
    return (
      <div className="yard-map-embed">
        <div className="map-placeholder">
          <p>אין מיקום למפה</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-map-embed">
      {iframeUrl && (
        <div className="map-container">
          <iframe
            src={iframeUrl}
            width="100%"
            height="300"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title="מיקום המגרש"
          />
        </div>
      )}
      <div className="map-actions">
        {googleMapsUrl && (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noreferrer"
            className="map-action-btn"
          >
            פתח ב-Google Maps
          </a>
        )}
        {wazeUrl && (
          <a
            href={wazeUrl}
            target="_blank"
            rel="noreferrer"
            className="map-action-btn"
          >
            פתח ב-Waze
          </a>
        )}
        {!wazeUrl && hasMapsLink && (
          <a
            href={mapsLink!.trim()}
            target="_blank"
            rel="noreferrer"
            className="map-action-btn"
          >
            פתח במפות
          </a>
        )}
      </div>
    </div>
  );
}

