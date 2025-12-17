/**
 * User Notification model
 * 
 * Firestore path: users/{userUid}/notifications/{notificationId}
 * 
 * Represents a notification delivered to a user (e.g., car match alert).
 */
export type NotificationType = 'CAR_MATCH';

export interface UserNotification {
  id: string;
  userUid: string;
  type: NotificationType;
  savedSearchId: string; // Reference to the saved search that triggered this
  carId: string; // Reference to the matching car
  yardUid: string; // Owner of the car
  title: string; // e.g. "נוסף רכב חדש שמתאים לחיפוש שלך"
  body: string; // e.g. "טויוטה קורולה 2016, 85,000 ק״מ, 55,000 ₪"
  isRead: boolean;
  createdAt: any; // Firestore Timestamp
}

