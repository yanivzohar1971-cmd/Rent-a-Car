/**
 * Centralized Firestore writes to enforce sanitizeFirestoreData. Adopt gradually.
 */

import { addDoc, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { sanitizeFirestoreData } from "../utils/firestoreSanitize";

export async function fsAddDoc<T extends Record<string, any>>(colRef: any, data: T) {
  const clean = sanitizeFirestoreData(data);
  return addDoc(colRef, clean as any);
}

export async function fsSetDoc<T extends Record<string, any>>(docRef: any, data: T, options?: any) {
  const clean = sanitizeFirestoreData(data);
  return options ? setDoc(docRef, clean as any, options) : setDoc(docRef, clean as any);
}

export async function fsUpdateDoc<T extends Record<string, any>>(docRef: any, data: Partial<T>) {
  const clean = sanitizeFirestoreData(data as any);
  return updateDoc(docRef, clean as any);
}

/**
 * Create a write batch (for batch operations)
 */
export function fsWriteBatch(db: any) {
  return writeBatch(db);
}

/**
 * Add a set operation to a batch (with sanitization)
 */
export function fsBatchSet(batch: any, docRef: any, data: any, options?: any) {
  const clean = sanitizeFirestoreData(data);
  return options ? batch.set(docRef, clean, options) : batch.set(docRef, clean);
}

/**
 * Add an update operation to a batch (with sanitization)
 */
export function fsBatchUpdate(batch: any, docRef: any, data: any) {
  const clean = sanitizeFirestoreData(data);
  return batch.update(docRef, clean);
}
