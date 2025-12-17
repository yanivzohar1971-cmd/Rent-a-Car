/**
 * Car Spec Image Clipboard Helper for Yard Smart Publish
 *
 * Creates a designed spec card image with:
 * - Car photo at top
 * - Spec list in Hebrew (gearbox, engine, km, ownership, color, fuel)
 * - Big price label
 * - Yard name and phone at bottom
 *
 * Uses Canvas API to generate PNG and Async Clipboard API to copy.
 * Must be called from a user gesture (onClick).
 */

export type ClipboardResult = 'success' | 'unsupported' | 'error';

/**
 * Options for generating the spec card image
 */
export interface CarSpecImageOptions {
  /** Main car photo URL */
  imageUrl: string;
  /** Car title (e.g. "יונדאי סונטה 2021") */
  title: string;
  /** Spec lines in Hebrew (e.g. ["תיבת הילוכים: אוטומט", "ק״מ: 85,000"]) */
  specs: string[];
  /** Formatted price label (e.g. "מחיר מבוקש: ₪134,000") */
  priceLabel?: string;
  /** Yard/dealer name */
  yardName?: string;
  /** Contact phone number */
  phone?: string;
  /** Background color (default: #f5f5f5) */
  backgroundColor?: string;
}

/**
 * Check if the Clipboard API with image support is available
 */
function isClipboardImageSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  );
}

/**
 * Load an image from URL with crossOrigin support
 */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));

    img.src = url;
  });
}

/**
 * Draw image with cover behavior (like CSS object-fit: cover)
 */
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  const imgRatio = img.naturalWidth / img.naturalHeight;
  const targetRatio = width / height;

  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = img.naturalWidth;
  let sourceHeight = img.naturalHeight;

  if (imgRatio > targetRatio) {
    // Image is wider - crop horizontally
    sourceWidth = img.naturalHeight * targetRatio;
    sourceX = (img.naturalWidth - sourceWidth) / 2;
  } else {
    // Image is taller - crop vertically
    sourceHeight = img.naturalWidth / targetRatio;
    sourceY = (img.naturalHeight - sourceHeight) / 2;
  }

  ctx.drawImage(
    img,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height
  );
}

/**
 * Draw a rounded rectangle
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Creates a spec card image and copies it to clipboard
 *
 * Layout (1080x1350 - 4:5 portrait):
 * - Top 65%: Car photo with cover fit
 * - Bottom 35%: White card with specs, price, yard info
 *
 * @param options - Spec card content options
 * @returns 'success' | 'unsupported' | 'error'
 */
export async function copyCarSpecImageToClipboard(
  options: CarSpecImageOptions
): Promise<ClipboardResult> {
  // Check browser support
  if (!isClipboardImageSupported()) {
    console.warn('Clipboard image API not supported in this browser');
    return 'unsupported';
  }

  const {
    imageUrl,
    title,
    specs,
    priceLabel,
    yardName,
    phone,
    backgroundColor = '#f5f5f5',
  } = options;

  if (!imageUrl) {
    console.error('copyCarSpecImageToClipboard: No image URL provided');
    return 'error';
  }

  try {
    // Canvas dimensions (4:5 ratio for social media)
    const width = 1080;
    const height = 1350;
    const imageAreaHeight = Math.round(height * 0.65); // 65% for photo
    const cardAreaTop = imageAreaHeight - 40; // Overlap card with image slightly
    const cardHeight = height - cardAreaTop;

    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('Failed to get canvas 2D context');
      return 'error';
    }

    // Load the car image
    const carImage = await loadImage(imageUrl);

    // 1. Fill background
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw car image at top (cover fit)
    drawImageCover(ctx, carImage, 0, 0, width, imageAreaHeight);

    // 3. Draw white card at bottom with rounded top corners
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 0, cardAreaTop, width, cardHeight + 40, 32);
    ctx.fill();

    // Add subtle shadow effect at card top
    const shadowGradient = ctx.createLinearGradient(0, cardAreaTop, 0, cardAreaTop + 20);
    shadowGradient.addColorStop(0, 'rgba(0,0,0,0.08)');
    shadowGradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = shadowGradient;
    ctx.fillRect(0, cardAreaTop, width, 20);

    // 4. Set up RTL text rendering
    ctx.textAlign = 'right';
    const textRightMargin = width - 50;
    let currentY = cardAreaTop + 70;

    // 5. Draw title (big, bold)
    ctx.fillStyle = '#1a1a2e';
    ctx.font = 'bold 52px Heebo, Arial, sans-serif';
    ctx.fillText(title, textRightMargin, currentY);
    currentY += 65;

    // 6. Draw green accent line under title
    ctx.fillStyle = '#4ecca3';
    ctx.fillRect(textRightMargin - 200, currentY - 25, 200, 4);
    currentY += 25;

    // 7. Draw specs list
    ctx.font = '34px Heebo, Arial, sans-serif';
    ctx.fillStyle = '#444444';

    for (const spec of specs) {
      // Add checkmark emoji
      const specLine = `✔️ ${spec}`;
      ctx.fillText(specLine, textRightMargin, currentY);
      currentY += 48;
    }

    currentY += 15;

    // 8. Draw price (big, bold, accent color)
    if (priceLabel) {
      ctx.fillStyle = '#e85d04'; // Orange accent for price
      ctx.font = 'bold 48px Heebo, Arial, sans-serif';
      ctx.fillText(priceLabel, textRightMargin, currentY);
      currentY += 60;
    }

    // 9. Draw footer with yard info
    const footerY = height - 50;
    ctx.fillStyle = '#666666';
    ctx.font = '32px Heebo, Arial, sans-serif';

    // Build footer text
    const footerParts: string[] = [];
    if (yardName) footerParts.push(`📍 ${yardName}`);
    if (phone) footerParts.push(`📞 ${phone}`);

    if (footerParts.length > 0) {
      const footerText = footerParts.join('   ');
      ctx.fillText(footerText, textRightMargin, footerY);
    }

    // 10. Add CarExpert branding in bottom left
    ctx.fillStyle = '#999999';
    ctx.font = '26px Heebo, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CarExpert.co.il', 50, footerY);

    // 11. Convert canvas to PNG blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });

    if (!blob) {
      console.error('Failed to create blob from canvas');
      return 'error';
    }

    // 12. Copy to clipboard
    const clipboardItem = new ClipboardItem({
      'image/png': blob,
    });

    await navigator.clipboard.write([clipboardItem]);
    return 'success';
  } catch (err) {
    console.error('Error creating spec image:', err);
    return 'error';
  }
}

