import { collection, getDocsFromServer, query, orderBy, limit, doc, getDocFromServer, onSnapshot, Unsubscribe } from 'firebase/firestore';
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

  try {
    // Step 1: Call Cloud Function to create job
    const createJobFn = httpsCallable(functions, 'yardImportCreateJob');
    const result = await createJobFn({ fileName: file.name });
    
    const data = result.data as any;
    const jobId = data.jobId as string;
    const uploadPath = data.uploadPath as string;

    if (!jobId || !uploadPath) {
      throw new Error('Invalid response from create job function');
    }

    // Step 2: Upload file to Storage
    const storageRef = ref(storage, uploadPath);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) {
            onProgress(progress);
          }
        },
        (error) => {
          console.error('Error uploading file:', error);
          reject(error);
        },
        async () => {
          // Upload complete
          try {
            await getDownloadURL(uploadTask.snapshot.ref);
            resolve({ jobId, uploadPath });
          } catch (error) {
            console.error('Error getting download URL:', error);
            reject(error);
          }
        }
      );
    });
  } catch (error) {
    console.error('Error creating import job:', error);
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
 */
export async function commitImportJob(userUid: string, jobId: string): Promise<void> {
  try {
    const commitFn = httpsCallable(functions, 'yardImportCommitJob');
    await commitFn({ jobId });
  } catch (error: any) {
    console.error('Error committing import job:', error);
    // Map Firebase Functions errors to user-friendly messages
    if (error.code === 'functions/not-found') {
      throw new Error('פונקציית הייבוא לא נמצאה. אנא ודא שהפונקציות מופעלות.');
    } else if (error.code === 'functions/unauthenticated') {
      throw new Error('נדרשת התחברות מחדש.');
    } else if (error.code === 'functions/permission-denied') {
      throw new Error('אין הרשאה לביצוע פעולה זו.');
    } else if (error.code === 'functions/invalid-argument') {
      throw new Error(error.message || 'פרמטרים לא תקינים.');
    } else {
      throw new Error(error.message || 'שגיאה באישור הייבוא.');
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

