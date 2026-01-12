/**
 * Lazy-loaded handler for AdminDebug search functions
 * 
 * Pure delegation wrappers that lazy-import the original module.
 * No business logic duplication - delegates to admin/adminDebugSearch.ts at invocation time.
 */

import * as functions from "firebase-functions";

/**
 * Handler implementation for adminDebugSearchYards
 */
export async function adminDebugSearchYards_impl(data: any, context: functions.https.CallableContext) {
  const mod = await import("../admin/adminDebugSearch");
  return mod.adminDebugSearchYardsHandler(data, context);
}

/**
 * Handler implementation for adminDebugSearchCars
 */
export async function adminDebugSearchCars_impl(data: any, context: functions.https.CallableContext) {
  const mod = await import("../admin/adminDebugSearch");
  return mod.adminDebugSearchCarsHandler(data, context);
}
