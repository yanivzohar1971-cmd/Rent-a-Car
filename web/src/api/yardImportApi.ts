import { collection, getDocsFromServer, query, orderBy, limit, doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import type { Unsubscribe } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
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
 * @param onProgress Optional progress callback (0-100)
 * @returns The created job with jobId and uploadPath
 */
export async function createImportJob(
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ jobId: string; uploadPath: string }> {
  const auth = getAuth();
  const user = auth.currentUser;

  if (!user) {
    throw new Error('User must be authenticated to create import job');
  }

  // Log file details before starting
  console.log('[YardImportUpload] Starting upload:', {
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
    const jobId = data.jobId as string;
    const uploadPath = data.uploadPath as string;

    if (!jobId || !uploadPath) {
      const errorMsg = `Invalid response from create job function: jobId=${jobId}, uploadPath=${uploadPath}`;
      console.error('[YardImportUpload]', errorMsg);
      throw new Error(errorMsg);
    }

    console.log('[YardImportUpload] Job created successfully:', {
      jobId,
      uploadPath,
    });

    // Step 2: Upload file to Storage
    console.log('[YardImportUpload] Starting file upload to Storage...', {
      uploadPath,
      fileSize: file.size,
    });
    
    const storageRef = ref(storage, uploadPath);
    
    // Verify storage ref is valid
    if (!storageRef) {
      throw new Error('Failed to create storage reference');
    }
    
    const uploadTask = uploadBytesResumable(storageRef, file);
    
    // Verify upload task is created
    if (!uploadTask) {
      throw new Error('Failed to create upload task');
    }
    
    console.log('[YardImportUpload] Upload task created, setting up listeners...');
    
    // Log initial state
    console.log('[YardImportUpload] Initial upload task state:', {
      snapshot: uploadTask.snapshot?.state,
      bytesTransferred: uploadTask.snapshot?.bytesTransferred,
      totalBytes: uploadTask.snapshot?.totalBytes,
    });
    
    // Set initial progress to 0% to ensure UI updates
    if (onProgress) {
      onProgress(0);
    }

    return new Promise((resolve, reject) => {
      let lastProgress = 0;
      let hasResolved = false;
      let hasRejected = false;
      
      // Set a timeout to detect stuck uploads (5 minutes)
      const timeout = setTimeout(() => {
        if (!hasResolved && !hasRejected) {
          console.error('[YardImportUpload] Upload timeout after 5 minutes');
          uploadTask.cancel();
          reject(new Error('ההעלאה נעצרה - זמן ההמתנה פג. אנא נסה שוב.'));
        }
      }, 5 * 60 * 1000);
      
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const bytesTransferred = snapshot.bytesTransferred;
          const totalBytes = snapshot.totalBytes;
          const progress = totalBytes > 0 ? (bytesTransferred / totalBytes) * 100 : 0;
          
          // Log progress updates (throttle to avoid spam)
          if (Math.abs(progress - lastProgress) >= 5 || progress === 0 || progress === 100) {
            console.log('[YardImportUpload] Upload progress:', {
              bytesTransferred,
              totalBytes,
              progress: progress.toFixed(1) + '%',
              state: snapshot.state,
            });
            lastProgress = progress;
          }
          
          if (onProgress) {
            onProgress(progress);
          }
        },
        (error) => {
          if (hasRejected) {
            console.warn('[YardImportUpload] Duplicate error handler call, ignoring');
            return;
          }
          hasRejected = true;
          clearTimeout(timeout);
          
          console.error('[YardImportUpload] Upload error:', {
            code: error.code,
            message: error.message,
            serverResponse: error.serverResponse,
            fullError: error,
          });
          reject(error);
        },
        async () => {
          if (hasResolved) {
            console.warn('[YardImportUpload] Duplicate completion handler call, ignoring');
            return;
          }
          hasResolved = true;
          clearTimeout(timeout);
          
          // Upload complete
          console.log('[YardImportUpload] Upload completed successfully');
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log('[YardImportUpload] Download URL obtained:', downloadURL);
            
            // Ensure progress is 100%
            if (onProgress) {
              onProgress(100);
            }
            
            resolve({ jobId, uploadPath });
          } catch (error) {
            console.error('[YardImportUpload] Error getting download URL:', error);
            reject(error);
          }
        }
      );
    });
  } catch (error: any) {
    console.error('[YardImportUpload] Error creating import job:', {
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
      throw new Error('אין הרשאה להעלות קבצים. אנא בדוק את הרשאות המשתמש.');
    } else if (error?.code === 'storage/canceled') {
      throw new Error('ההעלאה בוטלה.');
    } else if (error?.code === 'storage/unknown') {
      throw new Error('שגיאה לא ידועה בהעלאת הקובץ. אנא נסה שוב.');
    }
    
    throw error;
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
 * @returns Promise that resolves when commit completes
 */
export async function commitImportJob(userUid: string, jobId: string): Promise<void> {
  console.log('[YardImportCommit] Starting commit:', {
    userUid,
    jobId,
  });

  try {
    // Call the same Cloud Function that Android uses
    const commitFn = httpsCallable(functions, 'yardImportCommitJob');
    
    // Payload matches Android: { jobId }
    // The function gets yardUid from context.auth.uid
    console.log('[YardImportCommit] Calling yardImportCommitJob with payload:', { jobId });
    
    const result = await commitFn({ jobId });
    
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

