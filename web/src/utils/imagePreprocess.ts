/**
 * Preprocess an image file for upload: optional resize + JPEG recompress.
 * Keeps file as-is if already small enough; otherwise resizes long edge and exports as JPEG.
 * No EXIF (canvas export strips metadata). No new dependencies.
 */

export interface PreprocessOptions {
  maxLongEdge: number;
  jpegQuality: number;
  skipRecompressMaxBytes: number;
}

/**
 * Returns a File (either original or new JPEG) after optional resize/compress.
 * On any failure, returns the original file.
 */
export async function preprocessImageForUpload(
  file: File,
  options: PreprocessOptions
): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  let usedObjectUrl: string | null = null;
  try {
    const { maxLongEdge, jpegQuality, skipRecompressMaxBytes } = options;
    let width: number;
    let height: number;

    if (typeof createImageBitmap !== 'undefined') {
      const bitmap = await createImageBitmap(file);
      width = bitmap.width;
      height = bitmap.height;

      if (file.size <= skipRecompressMaxBytes && Math.max(width, height) <= maxLongEdge) {
        bitmap.close();
        return file;
      }

      const scale = Math.max(width, height) > maxLongEdge ? maxLongEdge / Math.max(width, height) : 1;
      const newW = Math.round(width * scale);
      const newH = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = newW;
      canvas.height = newH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        bitmap.close();
        return file;
      }
      ctx.drawImage(bitmap, 0, 0, width, height, 0, 0, newW, newH);
      bitmap.close();

      const blob = await new Promise<Blob | null>((res) => {
        canvas.toBlob(res, 'image/jpeg', jpegQuality);
      });
      if (!blob) return file;
      const baseName = file.name.replace(/\.[^.]+$/i, '') || file.name;
      return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
    }

    // Fallback: HTMLImageElement + object URL (revoke after load)
    const img = new Image();
    const loaded = new Promise<{ width: number; height: number }>((resolve, reject) => {
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Image load failed'));
    });
    usedObjectUrl = URL.createObjectURL(file);
    img.src = usedObjectUrl;
    const dims = await loaded;
    width = dims.width;
    height = dims.height;
    if (usedObjectUrl) {
      URL.revokeObjectURL(usedObjectUrl);
      usedObjectUrl = null;
    }

    if (file.size <= skipRecompressMaxBytes && Math.max(width, height) <= maxLongEdge) {
      return file;
    }

    const scale = Math.max(width, height) > maxLongEdge ? maxLongEdge / Math.max(width, height) : 1;
    const newW = Math.round(width * scale);
    const newH = Math.round(height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = newW;
    canvas.height = newH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height, 0, 0, newW, newH);

    const blob = await new Promise<Blob | null>((res) => {
      canvas.toBlob(res, 'image/jpeg', jpegQuality);
    });
    if (!blob) return file;
    const baseName = file.name.replace(/\.[^.]+$/i, '') || file.name;
    return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' });
  } catch {
    if (usedObjectUrl) URL.revokeObjectURL(usedObjectUrl);
    return file;
  }
}
