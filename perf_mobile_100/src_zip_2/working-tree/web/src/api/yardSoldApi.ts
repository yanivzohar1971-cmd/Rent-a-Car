/**
 * Yard Car Sold API
 * 
 * Handles marking cars as sold and related operations
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/firebaseClient';

/**
 * Mark a yard car as sold
 * 
 * This callable function:
 * - Marks the car as SOLD in MASTER
 * - Removes from publicCars projection
 * - Deletes all Storage images permanently
 * - Clears image metadata fields
 * 
 * @param carId - Car ID to mark as sold
 * @returns Promise with success status
 */
export async function markYardCarSold(carId: string): Promise<{
  success: boolean;
  message: string;
  deletedFilesCount?: number;
}> {
  try {
    const markSoldFn = httpsCallable(functions, 'markYardCarSold');
    const result = await markSoldFn({ carId });
    const data = result.data as any;
    
    console.log('[yardSoldApi] Car marked as sold:', data);
    return {
      success: data.success || false,
      message: data.message || 'Car marked as sold',
      deletedFilesCount: data.deletedFilesCount || 0,
    };
  } catch (error: any) {
    console.error('[yardSoldApi] Error marking car as sold:', error);
    throw new Error(error.message || 'Failed to mark car as sold');
  }
}
