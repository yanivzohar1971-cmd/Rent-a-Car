import { collection, getDocsFromServer, getDoc, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import type { SavedSearch } from '../types/SavedSearch';
import type { CarFilters } from './carsApi';
import type { PersonaView } from '../types/Roles';

export type { SavedSearch };

/**
 * Map Firestore document to SavedSearch
 */
function mapSavedSearchDoc(docSnap: any): SavedSearch {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    userUid: data.userUid || '',
    role: data.role || 'BUYER',
    type: data.type || 'CAR_FOR_SALE',
    filters: data.filters || {},
    label: data.label || '',
    active: data.active !== false, // Default to true
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    lastNotifiedAt: data.lastNotifiedAt || null,
  };
}

/**
 * Fetch all saved searches for a user
 */
export async function fetchSavedSearches(userUid: string): Promise<SavedSearch[]> {
  try {
    const savedSearchesRef = collection(db, 'users', userUid, 'savedSearches');
    const q = query(savedSearchesRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocsFromServer(q);
    return snapshot.docs.map(mapSavedSearchDoc);
  } catch (error) {
    console.error('Error fetching saved searches:', error);
    throw error;
  }
}

/**
 * Create a new saved search
 */
export async function createSavedSearch(
  userUid: string,
  data: {
    filters: CarFilters;
    label?: string;
    role: PersonaView;
    type: 'CAR_FOR_SALE';
  }
): Promise<SavedSearch> {
  try {
    const savedSearchesRef = collection(db, 'users', userUid, 'savedSearches');
    const now = serverTimestamp();
    const docRef = await addDoc(savedSearchesRef, {
      userUid,
      role: data.role,
      type: data.type,
      filters: data.filters,
      label: data.label || '',
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    // Fetch the created document
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return mapSavedSearchDoc(docSnap);
    }

    // Fallback if we can't find it immediately
    return {
      id: docRef.id,
      userUid,
      role: data.role,
      type: data.type,
      filters: data.filters,
      label: data.label || '',
      active: true,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    console.error('Error creating saved search:', error);
    throw error;
  }
}

/**
 * Update a saved search
 */
export async function updateSavedSearch(
  userUid: string,
  savedSearchId: string,
  patch: Partial<SavedSearch>
): Promise<void> {
  try {
    const savedSearchRef = doc(db, 'users', userUid, 'savedSearches', savedSearchId);
    const updateData: any = {
      updatedAt: serverTimestamp(),
    };

    if (patch.label !== undefined) updateData.label = patch.label;
    if (patch.active !== undefined) updateData.active = patch.active;
    if (patch.filters !== undefined) updateData.filters = patch.filters;

    await updateDoc(savedSearchRef, updateData);
  } catch (error) {
    console.error('Error updating saved search:', error);
    throw error;
  }
}

/**
 * Delete a saved search
 */
export async function deleteSavedSearch(userUid: string, savedSearchId: string): Promise<void> {
  try {
    const savedSearchRef = doc(db, 'users', userUid, 'savedSearches', savedSearchId);
    await deleteDoc(savedSearchRef);
  } catch (error) {
    console.error('Error deleting saved search:', error);
    throw error;
  }
}

/**
 * Generate a default label from filters (Hebrew)
 */
export function generateSearchLabel(filters: CarFilters): string {
  const parts: string[] = [];

  if (filters.manufacturer) {
    parts.push(filters.manufacturer);
  }
  if (filters.model) {
    parts.push(filters.model);
  }

  if (filters.yearTo) {
    parts.push(`עד ${filters.yearTo}`);
  } else if (filters.yearFrom) {
    parts.push(`מ-${filters.yearFrom}`);
  }

  if (filters.priceTo) {
    parts.push(`עד ${filters.priceTo.toLocaleString('he-IL')} ₪`);
  } else if (filters.priceFrom) {
    parts.push(`מ-${filters.priceFrom.toLocaleString('he-IL')} ₪`);
  }

  if (parts.length === 0) {
    return 'חיפוש כללי';
  }

  return parts.join(' ');
}

