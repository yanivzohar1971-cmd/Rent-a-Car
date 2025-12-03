import { collection, getDocsFromServer, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
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

