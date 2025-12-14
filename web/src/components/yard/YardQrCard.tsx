import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { buildYardPublicUrl } from '../../utils/yardPublicUrl';
import './YardQrCard.css';

interface YardQrCardProps {
  yardId: string;
  yardName?: string;
  yardEmail?: string;
  yardLogoUrl?: string | null;
}

export default function YardQrCard({ yardId, yardName, yardEmail, yardLogoUrl }: YardQrCardProps) {
  const [showFullscreenQr, setShowFullscreenQr] = useState(false);
  const yardUrl = buildYardPublicUrl(yardId);

  const handleDownloadPrint = () => {
    // Open a new window with print-friendly layout
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('לא ניתן לפתוח חלון חדש. בדוק את הגדרות חסימת החלונות בדפדפן.');
      return;
    }

    // Escape HTML for safe insertion
    const escapeHtml = (text: string) => {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const safeYardName = escapeHtml(yardName || '');
    const safeYardEmail = escapeHtml(yardEmail || '');
    const safeLogoUrl = yardLogoUrl ? escapeHtml(yardLogoUrl) : '';

    // Generate QR as data URL
    const qrSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    qrSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    qrSvg.setAttribute('width', '400');
    qrSvg.setAttribute('height', '400');
    qrSvg.setAttribute('viewBox', '0 0 400 400');

    // For simplicity, we'll use a canvas approach
    // Create a temporary canvas to render QR
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      alert('שגיאה ביצירת תמונה להדפסה');
      return;
    }

    // Fill white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 400, 400);

    // Render QR code using the same component but capture it
    // For now, we'll use a simpler approach: create HTML with inline SVG
    const htmlContent = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>קוד QR - ${safeYardName || 'מגרש רכבים'}</title>
  <style>
    body {
      font-family: 'Heebo', Arial, sans-serif;
      margin: 0;
      padding: 2rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      background: white;
      text-align: center;
    }
    .yard-logo-img {
      max-width: 240px;
      max-height: 96px;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
      margin: 0 auto 0.75rem auto;
    }
    @media (max-width: 480px) {
      .yard-logo-img {
        max-width: 180px;
        max-height: 72px;
      }
    }
    .yard-name {
      font-size: 2rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #333;
    }
    .yard-email {
      font-size: 1.5rem;
      font-weight: 500;
      margin: 0.25rem 0 1.25rem 0;
      color: #555;
      text-align: center;
      direction: ltr;
      unicode-bidi: plaintext;
      word-break: break-word;
    }
    .yard-identity {
      font-size: 2.1rem;
      font-weight: 700;
      margin: 0.25rem 0 1.25rem 0;
      color: #222;
      text-align: center;
      direction: ltr;
      unicode-bidi: plaintext;
      word-break: break-word;
    }
    .qr-container {
      margin: 2rem 0;
    }
    .instruction {
      font-size: 1.125rem;
      color: #666;
      margin-top: 1rem;
      max-width: 400px;
    }
    @media print {
      body {
        padding: 1rem;
      }
      .instruction {
        font-size: 1rem;
      }
    }
  </style>
</head>
<body>
  <h1 class="yard-name">${safeYardName || 'מגרש רכבים'}</h1>
  ${safeLogoUrl ? `<img class="yard-logo-img" src="${safeLogoUrl}" alt="Yard logo" />` : ''}
  ${safeYardEmail ? `<div class="yard-email" dir="ltr">${safeYardEmail}</div>` : ''}
  <div class="qr-container">
    <div id="qr-code"></div>
  </div>
  <p class="instruction">סרקו את הקוד כדי לראות את רכבי המגרש באתר</p>
  <script>
    // Wait for both logo and QR images to load before printing
    const pending = new Set();
    
    function markPending(el) {
      if (el) {
        pending.add(el);
        el.addEventListener('load', done, { once: true });
        el.addEventListener('error', done, { once: true });
      }
    }
    
    function done(e) {
      pending.delete(e.target);
      maybePrint();
    }
    
    function maybePrint() {
      if (pending.size === 0) {
        setTimeout(() => window.print(), 50);
      }
    }
    
    // Mark logo as pending if it exists
    const logo = document.querySelector('.yard-logo-img');
    markPending(logo);
    
    // Create QR image
    const qrUrl = '${yardUrl}';
    const qrDiv = document.getElementById('qr-code');
    const qrImage = document.createElement('img');
    qrImage.src = 'https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=' + encodeURIComponent(qrUrl);
    qrImage.alt = 'QR Code';
    qrImage.style.width = '400px';
    qrImage.style.height = '400px';
    qrDiv.appendChild(qrImage);
    markPending(qrImage);
    
    // Hard fallback timeout (2000ms) to prevent stuck windows
    setTimeout(() => {
      if (pending.size > 0) {
        window.print();
      }
    }, 2000);
  </script>
</body>
</html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <>
      <div className="yard-qr-card card">
        <div className="yard-qr-header">
          <h3 className="yard-qr-title">קוד ה-QR החכם של המגרש</h3>
          <p className="yard-qr-description">
            לקוחות שיסרקו את הקוד יראו באתר רק את רכבי המגרש שלך.
          </p>
        </div>
        <div className="yard-qr-content">
          {yardLogoUrl && (
            <div style={{ marginBottom: '0.75rem' }}>
              <img 
                src={yardLogoUrl} 
                alt="Yard logo" 
                style={{ maxHeight: '80px', width: 'auto', objectFit: 'contain' }}
              />
            </div>
          )}
          {yardEmail && (
            <div style={{ 
              fontSize: '1.25rem', 
              fontWeight: 600, 
              marginBottom: '0.5rem', 
              textAlign: 'center',
              direction: 'ltr',
              unicodeBidi: 'plaintext'
            }}>
              {yardEmail}
            </div>
          )}
          <div className="yard-qr-preview">
            <QRCodeSVG value={yardUrl} size={160} level="M" />
          </div>
          <div className="yard-qr-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowFullscreenQr(true)}
            >
              הצג QR ללקוח
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDownloadPrint}
            >
              הורד להדפסה
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen QR Modal */}
      {showFullscreenQr && (
        <div className="qr-modal-overlay" onClick={() => setShowFullscreenQr(false)}>
          <div className="qr-modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="qr-modal-close"
              onClick={() => setShowFullscreenQr(false)}
              aria-label="סגור"
            >
              ×
            </button>
            <div className="qr-modal-body">
              <div className="qr-modal-header">
                {yardLogoUrl ? <img className="qr-modal-logo" src={yardLogoUrl} alt="logo" /> : null}
                {yardEmail ? <div className="qr-modal-email" dir="ltr">{yardEmail}</div> : null}
                {yardName ? <div className="qr-modal-identity" dir="ltr">{yardName}</div> : null}
              </div>
              <div className="qr-modal-qr">
                <QRCodeSVG value={yardUrl} size={400} level="M" />
              </div>
              <p className="qr-modal-instruction">
                בקש מהלקוח לסרוק את הקוד כדי לראות את כל רכבי המגרש באתר.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

