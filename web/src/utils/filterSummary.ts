/**
 * Centralized filter summary formatting utilities
 * 
 * Provides consistent formatting for filter summaries displayed in dialogs.
 * This ensures text/format consistency across all filter dialogs.
 */

import { GearboxType, getGearboxTypeLabel } from '../types/carTypes';

/**
 * Format KM range summary string
 * 
 * @param kmFrom - Minimum KM value (optional)
 * @param kmTo - Maximum KM value (optional)
 * @returns Formatted summary string in Hebrew
 */
export function formatKmSummary(kmFrom?: number, kmTo?: number): string {
  if (kmFrom !== undefined && kmTo !== undefined) {
    return `נבחר: ${kmFrom.toLocaleString('he-IL')}–${kmTo.toLocaleString('he-IL')} ק״מ`;
  } else if (kmTo !== undefined) {
    return `נבחר: עד ${kmTo.toLocaleString('he-IL')} ק״מ`;
  } else if (kmFrom !== undefined) {
    return `נבחר: מ-${kmFrom.toLocaleString('he-IL')} ק״מ`;
  } else {
    return 'נבחר: ללא';
  }
}

/**
 * Format color summary string
 * 
 * @param color - Selected color value (optional)
 * @returns Formatted summary string in Hebrew
 */
export function formatColorSummary(color?: string): string {
  if (!color || color.trim() === '') {
    return 'נבחר: הכל';
  } else {
    return `נבחר: ${color}`;
  }
}

/**
 * Format gearbox types summary string
 * 
 * @param types - Array of selected gearbox types
 * @returns Formatted summary string in Hebrew
 */
export function formatGearboxSummary(types: GearboxType[]): string {
  if (!types || types.length === 0) {
    return 'נבחר: הכל';
  } else {
    const labels = types.map(t => getGearboxTypeLabel(t)).join(', ');
    return `נבחר: ${labels}`;
  }
}
