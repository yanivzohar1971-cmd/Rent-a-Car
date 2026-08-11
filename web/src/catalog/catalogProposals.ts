/**
 * Catalog Proposals - Store unknown models for later approval
 */

import { collection, doc, getDoc, setDoc, serverTimestamp, increment } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { getAuth } from 'firebase/auth';

export interface CatalogProposal {
  brandId: string;
  brandEn: string;
  brandHe: string;
  modelText: string; // Raw text typed by user
  modelSlug: string; // Computed slug
  source: string; // "web" or "android"
  createdAt: any; // serverTimestamp
  createdByUid?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  seenCount?: number;
  lastSeenAt?: any;
}

const COLLECTION_NAME = 'catalogProposals';

/**
 * Generate a slug from text (same logic as Python script)
 */
function slug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unknown';
}

/**
 * Generate deterministic document ID for de-duplication
 */
function generateDocId(brandId: string, modelSlug: string): string {
  return `${brandId}__${modelSlug}`;
}

/**
 * Submit a catalog proposal for a model that doesn't exist
 */
export async function submitCatalogProposal(
  brandId: string,
  brandEn: string,
  brandHe: string,
  modelText: string
): Promise<void> {
  const modelSlug = slug(modelText);
  const docId = generateDocId(brandId, modelSlug);
  const docRef = doc(collection(db, COLLECTION_NAME), docId);

  try {
    // Check if proposal already exists
    const existing = await getDoc(docRef);

    const auth = getAuth();
    const currentUser = auth.currentUser;

    if (existing.exists()) {
      // Update existing proposal: increment seenCount, update lastSeenAt
      await setDoc(
        docRef,
        {
          seenCount: increment(1),
          lastSeenAt: serverTimestamp(),
          // Update brand info in case it changed
          brandEn,
          brandHe,
        },
        { merge: true }
      );
    } else {
      // Create new proposal
      const proposal: Omit<CatalogProposal, 'createdAt'> = {
        brandId,
        brandEn,
        brandHe,
        modelText,
        modelSlug,
        source: 'web',
        createdByUid: currentUser?.uid,
        status: 'PENDING',
        seenCount: 1,
        lastSeenAt: serverTimestamp(),
      };

      await setDoc(docRef, {
        ...proposal,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error('Failed to submit catalog proposal:', error);
    throw error;
  }
}

