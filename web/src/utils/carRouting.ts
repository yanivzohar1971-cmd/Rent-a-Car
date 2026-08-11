/**
 * Centralized routing helper for car detail URLs
 * 
 * Prevents confusion between /car/:id (private seller ads) and /cars/:id (yard cars)
 */

export interface CarItem {
  id: string;
  sellerType?: 'YARD' | 'PRIVATE';
  source?: 'PUBLIC_CAR' | 'CAR_AD';
}

/**
 * Get the correct car details URL based on item type
 * 
 * @param item - Car item with sellerType or source
 * @param carId - Optional explicit car ID (defaults to item.id)
 * @returns URL path: /cars/:id for yard cars, /car/:id for private seller ads
 */
export function getCarDetailsUrl(item: CarItem | { id: string; sellerType?: string; source?: string }, carId?: string): string {
  const id = carId || item.id;
  
  // YARD cars (PUBLIC_CAR source) → /cars/:id
  if (item.sellerType === 'YARD' || item.source === 'PUBLIC_CAR') {
    return `/cars/${id}`;
  }
  
  // Private seller ads (CAR_AD source) → /car/:id
  if (item.sellerType === 'PRIVATE' || item.source === 'CAR_AD') {
    return `/car/${id}`;
  }
  
  // Default to /cars/:id for backward compatibility
  return `/cars/${id}`;
}
