/**
 * Image Clipboard Helper for Yard Smart Publish
 *
 * Provides two methods for copying car images to clipboard:
 * 1. copyImageUrlToClipboard - copies the original image as-is
 * 2. copyCarMarketingImageToClipboard - creates a branded marketing image on canvas
 *
 * Both use the modern Async Clipboard API (ClipboardItem + navigator.clipboard.write).
 * Must be called from a user gesture (onClick) to work properly.
 */

export type ClipboardResult = 'success' | 'unsupported' | 'error';

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
 * Option 1: Copy the original image URL directly to clipboard
 *
 * Fetches the image from the URL and copies it to the clipboard as-is.
 * Best for preserving original image quality.
 *
 * @param imageUrl - The URL of the image to copy
 * @returns 'success' | 'unsupported' | 'error'
 */
export async function copyImageUrlToClipboard(
  imageUrl: string
): Promise<ClipboardResult> {
  // Check browser support
  if (!isClipboardImageSupported()) {
    console.warn('Clipboard image API not supported in this browser');
    return 'unsupported';
  }

  if (!imageUrl) {
    console.error('copyImageUrlToClipboard: No image URL provided');
    return 'error';
  }

  try {
    // Fetch the image as a blob
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      return 'error';
    }

    const blob = await response.blob();

    // Validate blob type is an image
    if (!blob.type.startsWith('image/')) {
      console.error(`Fetched content is not an image: ${blob.type}`);
      return 'error';
    }

    // Create clipboard item and write to clipboard
    // Note: Some browsers only support PNG, so we might need to convert
    let clipboardBlob = blob;

    // If not PNG, try to convert using canvas (some browsers only accept PNG)
    if (blob.type !== 'image/png') {
      try {
        clipboardBlob = await convertBlobToPng(blob);
      } catch {
        // If conversion fails, try with original blob
        console.warn('PNG conversion failed, trying with original blob type');
      }
    }

    const clipboardItem = new ClipboardItem({
      [clipboardBlob.type]: clipboardBlob,
    });

    await navigator.clipboard.write([clipboardItem]);
    return 'success';
  } catch (err) {
    console.error('Error copying image to clipboard:', err);
    return 'error';
  }
}

/**
 * Convert any image blob to PNG using canvas
 */
async function convertBlobToPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (pngBlob) => {
          if (pngBlob) {
            resolve(pngBlob);
          } else {
            reject(new Error('Failed to convert to PNG'));
          }
        },
        'image/png'
      );
    };

    img.onerror = () => reject(new Error('Failed to load image for conversion'));
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Options for creating a branded marketing image
 */
export interface MarketingImageOptions {
  /** URL of the car's main image */
  imageUrl: string;
  /** Car title (e.g., "טויוטה קורולה 2024") */
  title?: string;
  /** Subtitle text (e.g., location or specs) */
  subtitle?: string;
  /** Formatted price label (e.g., "₪179,000") */
  priceLabel?: string;
  /** Yard/dealer name */
  yardName?: string;
  /** Optional yard logo URL */
  logoUrl?: string;
}

/**
 * Option 2: Create a branded marketing image on canvas and copy to clipboard
 *
 * Renders a professional-looking social media image with:
 * - Car photo (top 65-70%)
 * - Dark bottom band with title, price, yard name
 * - Optimized for social media (1080x1350 - 4:5 ratio)
 *
 * @param options - Image content options
 * @returns 'success' | 'unsupported' | 'error'
 */
export async function copyCarMarketingImageToClipboard(
  options: MarketingImageOptions
): Promise<ClipboardResult> {
  // Check browser support
  if (!isClipboardImageSupported()) {
    console.warn('Clipboard image API not supported in this browser');
    return 'unsupported';
  }

  const { imageUrl, title, subtitle, priceLabel, yardName } = options;

  if (!imageUrl) {
    console.error('copyCarMarketingImageToClipboard: No image URL provided');
    return 'error';
  }

  try {
    // Canvas dimensions (4:5 ratio for social media)
    const CANVAS_WIDTH = 1080;
    const CANVAS_HEIGHT = 1350;
    const IMAGE_AREA_HEIGHT = Math.floor(CANVAS_HEIGHT * 0.70); // 70% for image
    const TEXT_AREA_HEIGHT = CANVAS_HEIGHT - IMAGE_AREA_HEIGHT; // 30% for text

    // Create offscreen canvas
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      console.error('Failed to get canvas 2D context');
      return 'error';
    }

    // Load the car image
    const carImage = await loadImage(imageUrl);

    // 1. Draw white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // 2. Draw car image (cover/crop to fit top area)
    drawImageCover(ctx, carImage, 0, 0, CANVAS_WIDTH, IMAGE_AREA_HEIGHT);

    // 3. Draw dark bottom band
    const gradient = ctx.createLinearGradient(0, IMAGE_AREA_HEIGHT, 0, CANVAS_HEIGHT);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, IMAGE_AREA_HEIGHT, CANVAS_WIDTH, TEXT_AREA_HEIGHT);

    // 4. Draw subtle separator line
    ctx.fillStyle = '#4ecca3'; // Green accent
    ctx.fillRect(0, IMAGE_AREA_HEIGHT, CANVAS_WIDTH, 4);

    // 5. Draw text content (RTL)
    ctx.textAlign = 'right';
    const textX = CANVAS_WIDTH - 50; // Right margin
    let currentY = IMAGE_AREA_HEIGHT + 80;

    // Title (large, white)
    if (title) {
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 56px Heebo, Arial, sans-serif';
      ctx.fillText(title, textX, currentY);
      currentY += 70;
    }

    // Price (extra large, green accent)
    if (priceLabel) {
      ctx.fillStyle = '#4ecca3';
      ctx.font = 'bold 72px Heebo, Arial, sans-serif';
      ctx.fillText(priceLabel, textX, currentY);
      currentY += 80;
    }

    // Subtitle (medium, light gray)
    if (subtitle) {
      ctx.fillStyle = '#a0a0a0';
      ctx.font = '36px Heebo, Arial, sans-serif';
      ctx.fillText(subtitle, textX, currentY);
      currentY += 50;
    }

    // Yard name (medium, white)
    if (yardName) {
      ctx.fillStyle = '#ffffff';
      ctx.font = '40px Heebo, Arial, sans-serif';
      const yardLabel = `📍 ${yardName}`;
      ctx.fillText(yardLabel, textX, currentY);
    }

    // 6. Draw CarExpert branding in corner
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '28px Heebo, Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CarExpert.co.il', 50, CANVAS_HEIGHT - 40);

    // 7. Convert canvas to PNG blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });

    if (!blob) {
      console.error('Failed to create blob from canvas');
      return 'error';
    }

    // 8. Copy to clipboard
    const clipboardItem = new ClipboardItem({
      'image/png': blob,
    });

    await navigator.clipboard.write([clipboardItem]);
    return 'success';
  } catch (err) {
    console.error('Error creating marketing image:', err);
    return 'error';
  }
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
 * Draw image with cover/crop behavior (like CSS object-fit: cover)
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

