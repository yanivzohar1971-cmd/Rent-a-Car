/**
 * Lazy-loaded handler for AdminDebug functions
 * 
 * Pure delegation wrappers that lazy-import the original module.
 * No business logic duplication - delegates to admin/adminDebug.ts at invocation time.
 */

/**
 * Handler implementations - pure delegation to original module
 */

export async function adminDebugPing_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugPingHandler(data, context);
}

export async function adminDebugMasterCarState_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugMasterCarStateHandler(data, context);
}

export async function adminDebugPublicCarState_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugPublicCarStateHandler(data, context);
}

export async function adminDebugCheckCar_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugCheckCarHandler(data, context);
}

export async function adminDebugReprojectCar_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugReprojectCarHandler(data, context);
}

export async function adminDebugReprojectYard_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugReprojectYardHandler(data, context);
}

export async function adminDebugYardPublishedCounts_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugYardPublishedCountsHandler(data, context);
}

export async function adminDebugScanMasterHealth_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugScanMasterHealthHandler(data, context);
}

export async function adminDebugScanPublishSignals_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugScanPublishSignalsHandler(data, context);
}

export async function adminDebugRepairMissingCarFields_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugRepairMissingCarFieldsHandler(data, context);
}

export async function adminDebugRepairCarFields_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugRepairCarFieldsHandler(data, context);
}

export async function adminDebugCustomerHealthCheck_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugCustomerHealthCheckHandler(data, context);
}

export async function adminDebugRebuildAdminUsersIndex_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugRebuildAdminUsersIndexHandler(data, context);
}

export async function adminDebugListYards_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugListYardsHandler(data, context);
}

export async function adminDebugListYardCars_impl(data: any, context: any) {
  const mod = await import("../admin/adminDebug");
  return mod.adminDebugListYardCarsHandler(data, context);
}
