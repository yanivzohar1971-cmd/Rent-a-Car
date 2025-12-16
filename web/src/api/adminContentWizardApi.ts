/**
 * Admin Content Wizard API
 * Firestore operations for content wizard drafts
 */

import {
  collection,
  addDoc,
  updateDoc,
  doc,
  getDocs,
  query,
  orderBy,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { ContentDraft, WizardBrief, GeneratedContent } from '../types/contentWizard';

const COLLECTION_NAME = 'adminContentDrafts';

/**
 * Save a new draft
 */
export async function saveDraft(brief: WizardBrief): Promise<string> {
  try {
    const now = new Date().toISOString();
    const draftData: Omit<ContentDraft, 'id'> = {
      createdAt: now,
      updatedAt: now,
      brief,
      status: 'DRAFT',
    };

    const docRef = await addDoc(collection(db, COLLECTION_NAME), {
      ...draftData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return docRef.id;
  } catch (error) {
    console.error('Error saving draft:', error);
    throw error;
  }
}

/**
 * Update an existing draft
 */
export async function updateDraft(
  draftId: string,
  updates: {
    brief?: WizardBrief;
    generated?: GeneratedContent | string;
    status?: 'DRAFT' | 'PUBLISHED';
  }
): Promise<void> {
  try {
    const draftRef = doc(db, COLLECTION_NAME, draftId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };

    if (updates.brief) {
      updateData.brief = updates.brief;
    }
    if (updates.generated !== undefined) {
      updateData.generated = updates.generated;
    }
    if (updates.status) {
      updateData.status = updates.status;
    }

    await updateDoc(draftRef, updateData);
  } catch (error) {
    console.error('Error updating draft:', error);
    throw error;
  }
}

/**
 * Get a draft by ID
 */
export async function getDraft(draftId: string): Promise<ContentDraft | null> {
  try {
    const draftRef = doc(db, COLLECTION_NAME, draftId);
    const draftSnap = await getDoc(draftRef);

    if (!draftSnap.exists()) {
      return null;
    }

    const data = draftSnap.data();
    return {
      id: draftSnap.id,
      ...data,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
      updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || new Date().toISOString(),
    } as ContentDraft;
  } catch (error) {
    console.error('Error getting draft:', error);
    throw error;
  }
}

/**
 * List all drafts (admin only)
 */
export async function listDrafts(): Promise<ContentDraft[]> {
  try {
    const q = query(collection(db, COLLECTION_NAME), orderBy('updatedAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        id: docSnap.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt || new Date().toISOString(),
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || new Date().toISOString(),
      } as ContentDraft;
    });
  } catch (error) {
    console.error('Error listing drafts:', error);
    throw error;
  }
}

/**
 * Publish a draft (mark as PUBLISHED)
 * Note: This only marks it as published in Firestore.
 * Actual publishing to blog system should be handled separately.
 */
export async function publishDraft(draftId: string): Promise<void> {
  try {
    await updateDraft(draftId, { status: 'PUBLISHED' });
  } catch (error) {
    console.error('Error publishing draft:', error);
    throw error;
  }
}
