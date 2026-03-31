import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebase/firebaseClient';

type FirebaseLikeError = { code?: unknown };

export function isStorageUnauthorizedError(error: unknown): boolean {
  const code = typeof (error as FirebaseLikeError | null)?.code === 'string'
    ? ((error as FirebaseLikeError).code as string)
    : '';
  return code === 'storage/unauthorized' || code === 'storage/permission-denied' || code === 'permission-denied';
}

export async function ensureAdminStorageClaimAndRefresh(): Promise<void> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('User must be authenticated to refresh admin storage claim');
  }

  const setAdminCustomClaim = httpsCallable(functions, 'setAdminCustomClaim');
  await setAdminCustomClaim({ uid: user.uid });
  await user.getIdToken(true);
}

/**
 * Retry one time after forced token refresh when storage upload is unauthorized.
 * Keeps behavior narrow for upload flows without introducing wider side effects.
 */
export async function withAdminStorageClaimRetry<T>(
  _context: string,
  task: () => Promise<T>,
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    if (!isStorageUnauthorizedError(error)) throw error;
    await ensureAdminStorageClaimAndRefresh();
    return await task();
  }
}
