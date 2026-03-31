import {
  auth,
  getDownloadURL,
  ref,
  storage,
  uploadBytesResumable,
  type UploadMetadata,
} from '../firebase/firebaseClient';
import { isStorageUnauthorizedError, withAdminStorageClaimRetry } from './adminStorageClaim';

export type TenantSiteMediaKind = 'logo' | 'hero' | 'og';
export const TENANT_SITE_UPLOAD_GUARD_MESSAGE = 'נא לבחור מגרש ולטעון קונפיגורציה לפני העלאת קבצים.';
export const TENANT_SITE_UPLOAD_UNAUTHORIZED_MESSAGE = 'אין הרשאה להעלות קבצים. נסה לרענן או לטעון קונפיגורציה מחדש.';

/** Aligned with storage.rules (image/*, 5MB cap). */
export const TENANT_SITE_MEDIA_MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

function extFromFile(file: File): string {
  const n = file.name.split('.').pop();
  if (!n || n.length > 8) return 'jpg';
  return n.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
}

/**
 * Reject path injection / multi-segment ids so Storage paths stay `tenantSiteAssets/{tenantId}/{file}`.
 */
export function assertSafeTenantIdForStoragePath(tenantIdInput: string): string {
  const t = tenantIdInput.trim();
  if (!t) {
    throw new Error('tenantId נדרש להעלאה');
  }
  if (t.length > 200) {
    throw new Error('tenantId ארוך מדי');
  }
  if (/[/\\#?\x00-\x1f]/.test(t)) {
    throw new Error('tenantId מכיל תווים אסורים (אין להשתמש ב-/ או \\ בנתיב)');
  }
  return t;
}

export function validateTenantSiteImageFile(file: File): void {
  if (!file || !(file instanceof File)) {
    throw new Error('קובץ לא תקין');
  }
  if (!file.type.startsWith('image/')) {
    throw new Error('רק קבצי תמונה');
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error('סוג תמונה לא נתמך (השתמשו ב-JPEG, PNG, WebP, GIF או SVG)');
  }
  if (file.size > TENANT_SITE_MEDIA_MAX_BYTES) {
    throw new Error('הקובץ גדול מדי (מקסימום 5MB)');
  }
  if (file.size === 0) {
    throw new Error('הקובץ ריק');
  }
}

export function mapTenantSiteMediaUploadErrorForUser(error: unknown): string {
  if (isStorageUnauthorizedError(error)) {
    return TENANT_SITE_UPLOAD_UNAUTHORIZED_MESSAGE;
  }
  return 'העלאת קובץ נכשלה. נסו שוב בעוד רגע.';
}

/**
 * Upload a tenant site image to Storage (admin-only per storage.rules).
 * Path: tenantSiteAssets/{tenantId}/{kind}_{timestamp}.{ext}
 */
export async function uploadTenantSiteMedia(
  tenantIdInput: string,
  kind: TenantSiteMediaKind,
  file: File,
  onProgress?: (ratio: number) => void,
): Promise<string> {
  const tenantId = assertSafeTenantIdForStoragePath(tenantIdInput);
  validateTenantSiteImageFile(file);

  const user = auth.currentUser;
  if (!user) {
    throw new Error('יש להתחבר כדי להעלות קבצים');
  }

  const ts = Date.now();
  const ext = extFromFile(file);
  const fileName = `${kind}_${ts}.${ext}`;
  const storagePath = `tenantSiteAssets/${tenantId}/${fileName}`;
  const storageRef = ref(storage, storagePath);

  const metadata: UploadMetadata = {
    cacheControl: 'public, max-age=3600',
    contentType: file.type || undefined,
  };

  const runUpload = async () =>
    new Promise<string>((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, file, metadata);
      task.on(
        'state_changed',
        (snapshot) => {
          if (!onProgress) return;
          const total = snapshot.totalBytes || 0;
          const ratio = total > 0 ? snapshot.bytesTransferred / total : 0;
          onProgress(Math.max(0, Math.min(1, ratio)));
        },
        (err) => reject(err),
        async () => {
          try {
            const url = await getDownloadURL(storageRef);
            resolve(url);
          } catch (err) {
            reject(err);
          }
        },
      );
    });

  return withAdminStorageClaimRetry('tenantSiteMedia.upload', runUpload);
}
