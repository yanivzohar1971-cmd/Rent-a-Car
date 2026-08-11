import { collection, getDocsFromServer, query, orderBy, limit, doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, storage, functions } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';

/**
 * Yard import job status
 */
export type YardImportJobStatus = 
  | 'UPLOADED'
  | 'PROCESSING'
  | 'PREVIEW_READY'
  | 'COMMITTING'
  | 'COMMITTED'
  | 'FAILED';

/**
 * Yard import job (from users/{uid}/yardImportJobs collection)
 */
export interface YardImportJob {
  id: string;
  jobId: string;
  createdAt: any; // Firestore Timestamp
  createdBy: string;
  status: YardImportJobStatus;
  source?: {
    storagePath?: string;
    fileName?: string;
    importerId?: string;
    importerVersion?: number;
  };
  summary?: {
    rowsTotal?: number;
    rowsValid?: number;
    rowsWithWarnings?: number;
    rowsWithErrors?: number;
    carsToCreate?: number;
    carsToUpdate?: number;
    carsSkipped?: number;
    carsProcessed?: number;
  };
  updatedAt?: any; // Firestore Timestamp
  error?: {
    message?: string;
  };
}

/**
 * Preview row from import job (matches Android YardImportPreviewRow)
 */
export interface YardImportPreviewRow {
  rowIndex: number;
  raw: Record<string, any>;
  normalized: {
    license?: string | null;
    licenseClean?: string | null;
    manufacturer?: string | null;
    model?: string | null;
    year?: number | null;
    mileage?: number | null;
    gear?: string | null;
    color?: string | null;
    engineCc?: number | null;
    ownership?: string | null;
    testUntil?: string | null;
    hand?: number | null;
    trim?: string | null;
    askPrice?: number | null;
    listPrice?: number | null;
  };
  issues: Array<{
    level: 'WARNING' | 'ERROR';
    code: string;
    message: string;
  }>;
  dedupeKey: string;
}

/**
 * Create a new import job and upload Excel file
 * @param file The Excel file to upload
 * @param _onProgress Optional progress callback (ignored - kept for backward compatibility)
 * @returns The created job with jobId and uploadPath
 */
export async function createImportJob(
  file: File,
  _onProgress?: (progress: number) => void
): Promise<{ jobId: string; uploadPath: string }> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to create import job');
  }

  // Log file details before starting
  console.log('[YardImportUpload] Starting upload (KISS, no progress bar):', {
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    yardUid: user.uid,
  });

  try {
    // Step 1: Call Cloud Function to create job
    console.log('[YardImportUpload] Calling yardImportCreateJob callable...');
    const createJobFn = httpsCallable(functions, 'yardImportCreateJob');
    const result = await createJobFn({ fileName: file.name });
    
    console.log('[YardImportUpload] Callable response received:', result);
    
    const data = result.data as any;
    const jobId = data?.jobId;
    const uploadPath = data?.uploadPath;

    // Validate response
    if (!jobId || !uploadPath || typeof uploadPath !== 'string') {
      console.error('[YardImportUpload] Invalid response from yardImportCreateJob:', { data });
      throw new Error('קיימת בעיה בשרת הייבוא. אנא נסה שוב מאוחר יותר.');
    }

    if (!uploadPath.startsWith(`yardImports/${user.uid}/`)) {
      console.warn('[YardImportUpload] Unexpected uploadPath for yard import:', {
        uploadPath,
        uid: user.uid,
      });
      // Still continue, but log loudly.
    }

    console.log('[YardImportUpload] Job created successfully:', {
      jobId,
      uploadPath,
    });

    // Step 2: Upload file to Storage (simple one-shot upload, no progress tracking)
    const storageRef = ref(storage, uploadPath);
    
    // Verify storage ref is valid
    if (!storageRef) {
      throw new Error('Failed to create storage reference');
    }

    console.log('[YardImportUpload] Uploading file to Storage...', {
      bucket: storage.app.options.storageBucket,
      uploadPath,
      fileSize: file.size,
      fileType: file.type,
    });

    try {
      await uploadBytes(storageRef, file);
      console.log('[YardImportUpload] Upload finished OK', {
        uploadPath,
        jobId,
      });
      return { jobId, uploadPath };
    } catch (uploadError: any) {
      console.error('[YardImportUpload][ERROR] Failed to upload file to Storage:', {
        uploadPath,
        code: uploadError?.code,
        message: uploadError?.message,
        name: uploadError?.name,
      });

      if (uploadError?.code === 'storage/unauthorized') {
        throw new Error('אין הרשאה להעלות קבצים. אנא בדוק את ההרשאות ונסה שוב.');
      }
      if (uploadError?.code === 'storage/retry-limit-exceeded') {
        throw new Error('העלאת הקובץ נכשלה (בעיית רשת). אנא בדוק את החיבור ונסה שוב.');
      }

      throw new Error(uploadError?.message || 'שגיאה בהעלאת קובץ האקסל לשרת.');
    }
  } catch (error: any) {
    console.error('[YardImportUpload][ERROR] Error creating import job:', {
      error,
      code: error?.code,
      message: error?.message,
      details: error?.details,
    });
    
    // Map Firebase Functions errors to user-friendly messages
    if (error?.code === 'functions/not-found') {
      throw new Error('פונקציית הייבוא לא נמצאה. אנא ודא שהפונקציות מופעלות.');
    } else if (error?.code === 'functions/unauthenticated') {
      throw new Error('נדרשת התחברות מחדש.');
    } else if (error?.code === 'functions/permission-denied') {
      throw new Error('אין הרשאה לביצוע פעולה זו.');
    } else if (error?.code === 'functions/invalid-argument') {
      throw new Error(error.message || 'פרמטרים לא תקינים.');
    } else if (error?.code === 'storage/unauthorized') {
      throw new Error('אין הרשאה להעלות קבצים. אנא בדוק את ההרשאות.');
    } else if (error?.code === 'storage/canceled') {
      throw new Error('ההעלאה בוטלה.');
    } else if (error?.code === 'storage/unknown') {
      throw new Error('שגיאה לא ידועה בהעלאת הקובץ. אנא נסה שוב.');
    }
    
    // Default error message
    throw new Error(error?.message || 'שגיאה בהעלאת קובץ האקסל. אנא נסה שוב.');
  }
}

/**
 * Load a single import job by ID
 */
export async function loadImportJob(userUid: string, jobId: string): Promise<YardImportJob | null> {
  try {
    const jobDocRef = doc(db, 'users', userUid, 'yardImportJobs', jobId);
    const jobDoc = await getDocFromServer(jobDocRef);

    if (!jobDoc.exists()) {
      return null;
    }

    const data = jobDoc.data();
    return {
      id: jobDoc.id,
      jobId: data.jobId || jobDoc.id,
      createdAt: data.createdAt,
      createdBy: data.createdBy || userUid,
      status: (data.status || 'UPLOADED') as YardImportJobStatus,
      source: data.source || {},
      summary: data.summary || {},
      updatedAt: data.updatedAt,
      error: data.error || undefined,
    };
  } catch (error) {
    console.error('Error loading import job:', error);
    throw error;
  }
}

/**
 * Observe an import job in real-time
 * @returns Unsubscribe function
 */
export function observeImportJob(
  userUid: string,
  jobId: string,
  onUpdate: (job: YardImportJob) => void
): Unsubscribe {
  const jobDocRef = doc(db, 'users', userUid, 'yardImportJobs', jobId);
  
  return onSnapshot(
    jobDocRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const job: YardImportJob = {
          id: snapshot.id,
          jobId: data.jobId || snapshot.id,
          createdAt: data.createdAt,
          createdBy: data.createdBy || userUid,
          status: (data.status || 'UPLOADED') as YardImportJobStatus,
          source: data.source || {},
          summary: data.summary || {},
          updatedAt: data.updatedAt,
          error: data.error || undefined,
        };
        onUpdate(job);
      }
    },
    (error) => {
      console.error('Error observing import job:', error);
    }
  );
}

/**
 * Load preview rows for an import job
 * Preview rows are stored in users/{uid}/yardImportJobs/{jobId}/preview subcollection
 */
export async function loadImportPreviewRows(
  userUid: string,
  jobId: string
): Promise<YardImportPreviewRow[]> {
  try {
    const previewRef = collection(db, 'users', userUid, 'yardImportJobs', jobId, 'preview');
    const snapshot = await getDocsFromServer(previewRef);

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        rowIndex: data.rowIndex || 0,
        raw: data.raw || {},
        normalized: data.normalized || {},
        issues: data.issues || [],
        dedupeKey: data.dedupeKey || '',
      };
    }).sort((a, b) => a.rowIndex - b.rowIndex);
  } catch (error) {
    console.error('Error loading preview rows:', error);
    throw error;
  }
}

/**
 * Commit an import job (creates/updates cars in Firestore)
 * This function calls the same Cloud Function that Android uses: yardImportCommitJob
 * 
 * @param userUid The authenticated user's UID (for logging, not sent to function)
 * @param jobId The import job ID to commit
 * @param missingCarsMode Optional mode for handling missing cars: 'IMPORT_REMOVED' (default) or 'SOLD_DELETE'
 * @returns Promise that resolves when commit completes
 */
export async function commitImportJob(
  userUid: string, 
  jobId: string, 
  missingCarsMode?: 'IMPORT_REMOVED' | 'SOLD_DELETE'
): Promise<void> {
  console.log('[YardImportCommit] Starting commit:', {
    userUid,
    jobId,
    missingCarsMode: missingCarsMode || 'IMPORT_REMOVED',
  });

  try {
    // Call the same Cloud Function that Android uses
    const commitFn = httpsCallable(functions, 'yardImportCommitJob');
    
    // Payload includes missingCarsMode (defaults to IMPORT_REMOVED on server if not provided)
    // The function gets yardUid from context.auth.uid
    console.log('[YardImportCommit] Calling yardImportCommitJob with payload:', { jobId, missingCarsMode });
    
    const result = await commitFn({ jobId, missingCarsMode: missingCarsMode || 'IMPORT_REMOVED' });
    
    console.log('[YardImportCommit] Commit completed successfully:', result.data);
  } catch (error: any) {
    console.error('[YardImportCommit] Error committing import job:', {
      error,
      code: error?.code,
      message: error?.message,
      details: error?.details,
      userUid,
      jobId,
    });
    
    // Map Firebase Functions errors to user-friendly messages
    if (error?.code === 'functions/not-found') {
      throw new Error('פונקציית הייבוא לא נמצאה. אנא ודא שהפונקציות מופעלות.');
    } else if (error?.code === 'functions/unauthenticated') {
      throw new Error('נדרשת התחברות מחדש.');
    } else if (error?.code === 'functions/permission-denied') {
      throw new Error('אין הרשאה לביצוע פעולה זו.');
    } else if (error?.code === 'functions/invalid-argument') {
      throw new Error(error?.message || 'פרמטרים לא תקינים.');
    } else if (error?.code === 'functions/internal') {
      throw new Error(error?.message || 'שגיאה פנימית בשרת. אנא נסה שוב מאוחר יותר.');
    } else {
      throw new Error(error?.message || 'שגיאה באישור הייבוא.');
    }
  }
}

/**
 * Fetch import jobs for the current authenticated user
 * Returns the most recent jobs first
 */
export async function fetchYardImportJobs(limitCount: number = 10): Promise<YardImportJob[]> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to fetch import jobs');
  }

  try {
    const jobsRef = collection(db, 'users', user.uid, 'yardImportJobs');
    const q = query(
      jobsRef,
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocsFromServer(q);

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        jobId: data.jobId || docSnap.id,
        createdAt: data.createdAt,
        createdBy: data.createdBy || user.uid,
        status: (data.status || 'UPLOADED') as YardImportJobStatus,
        source: data.source || {},
        summary: data.summary || {},
        updatedAt: data.updatedAt,
        error: data.error || undefined,
      };
    });
  } catch (error) {
    console.error('Error fetching yard import jobs:', error);
    throw error;
  }
}

