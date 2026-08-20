/**
 * Schema profile derived from Android CloudDeltaSyncWorker + firestore.rules.
 * Path ownership: users/{uid}/{collection}/{docId}[+ nested].
 */

export const ANDROID_USER_SCOPED_COLLECTIONS = Object.freeze([
  'customers',
  'suppliers',
  'agents',
  'carTypes',
  'branches',
  'reservations',
  'payments',
  'commissionRules',
  'cardStubs',
  'requests',
  'carSales',
  'carSaleCommissionPayments',
]);

/** Web/yard extras under users/{uid}/ — USER_SCOPED but not Android sync-critical. */
export const WEB_USER_SCOPED_COLLECTIONS = Object.freeze([
  'favorites',
  'savedSearches',
  'notifications',
  'leads',
  'yardImportJobs',
]);

export const SHARED_GLOBAL_COLLECTIONS = Object.freeze([
  'publicCars',
  'leads',
  'carAds',
  'promotionProducts',
  'promotionOrders',
  'billingPlans',
  'billingPeriods',
  'yards',
  'config',
  'publicConfig',
  'rentalCompanies',
  'adminUsersIndex',
  'adminSellerExposure',
  'carViewStats',
  'carViewsEvents',
  'adminDebugProgress',
  'govSyncJobs',
  'tenantDomains',
  'tenantSiteConfigs',
  'tenantSiteClones',
  'tenants',
  'tenantPublicState',
  'catalogProposals',
  'yzDevBridgeTasks',
  'debug_rentacar',
]);

export const OWNERSHIP_FIELD_NAMES = Object.freeze([
  'userUid',
  'user_uid',
  'ownerUid',
  'yardUid',
  'ownerUserId',
]);

export const SHAGRIR_IDENTIFIER_FIELDS = Object.freeze([
  'supplierOrderNumber',
  'externalContractNumber',
]);

export function classifyCollection(name) {
  const key = String(name || '').trim();
  if (ANDROID_USER_SCOPED_COLLECTIONS.includes(key)) return 'USER_SCOPED';
  if (WEB_USER_SCOPED_COLLECTIONS.includes(key)) return 'USER_SCOPED';
  if (SHARED_GLOBAL_COLLECTIONS.includes(key)) return 'SHARED_GLOBAL';
  return 'UNKNOWN';
}

export function userRootPath(uid) {
  return `users/${uid}`;
}

export function userCollectionPath(uid, collection) {
  return `users/${uid}/${collection}`;
}

export function defaultCopyCollections({ includeWeb = false } = {}) {
  return includeWeb
    ? [...ANDROID_USER_SCOPED_COLLECTIONS, ...WEB_USER_SCOPED_COLLECTIONS]
    : [...ANDROID_USER_SCOPED_COLLECTIONS];
}
