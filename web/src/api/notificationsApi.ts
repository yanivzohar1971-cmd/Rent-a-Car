import { collection, query, orderBy, limit, onSnapshot, doc, updateDoc, getDocsFromServer, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { fsWriteBatch, fsBatchUpdate } from './firestoreWrite';
import type { UserNotification } from '../types/UserNotification';

export type { UserNotification };

/**
 * Map Firestore document to UserNotification
 */
function mapNotificationDoc(docSnap: any): UserNotification {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    userUid: data.userUid || '',
    type: data.type || 'CAR_MATCH',
    savedSearchId: data.savedSearchId || '',
    carId: data.carId || '',
    yardUid: data.yardUid || '',
    title: data.title || '',
    body: data.body || '',
    isRead: data.isRead === true,
    createdAt: data.createdAt,
  };
}

/**
 * Observe user notifications in real-time
 * Returns unsubscribe function
 */
export function observeUserNotifications(
  userUid: string,
  callback: (notifications: UserNotification[]) => void,
  notificationLimit: number = 20
): () => void {
  const notificationsRef = collection(db, 'users', userUid, 'notifications');
  const q = query(notificationsRef, orderBy('createdAt', 'desc'), limit(notificationLimit));

  return onSnapshot(
    q,
    (snapshot) => {
      const notifications = snapshot.docs.map(mapNotificationDoc);
      callback(notifications);
    },
    (error) => {
      console.error('Error observing notifications:', error);
      callback([]);
    }
  );
}

/**
 * Mark a notification as read
 */
export async function markNotificationRead(userUid: string, notificationId: string): Promise<void> {
  try {
    const notificationRef = doc(db, 'users', userUid, 'notifications', notificationId);
    await updateDoc(notificationRef, {
      isRead: true,
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsRead(userUid: string): Promise<void> {
  try {
    const notificationsRef = collection(db, 'users', userUid, 'notifications');
    const q = query(notificationsRef, where('isRead', '==', false));
    const snapshot = await getDocsFromServer(q);

    if (snapshot.empty) return;

    const batch = fsWriteBatch(db);
    snapshot.docs.forEach((docSnap) => {
      const notificationRef = doc(db, 'users', userUid, 'notifications', docSnap.id);
      fsBatchUpdate(batch, notificationRef, { isRead: true });
    });

    await batch.commit();
  } catch (error) {
    console.error('Error marking all notifications as read:', error);
    throw error;
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadNotificationCount(userUid: string): Promise<number> {
  try {
    const notificationsRef = collection(db, 'users', userUid, 'notifications');
    const q = query(notificationsRef, where('isRead', '==', false));
    const snapshot = await getDocsFromServer(q);
    return snapshot.size;
  } catch (error) {
    console.error('Error getting unread notification count:', error);
    return 0;
  }
}

