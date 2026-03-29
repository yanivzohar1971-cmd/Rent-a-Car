import {
  collection,
  db,
  deleteDoc,
  doc,
  getDocFromServer,
  getDocsFromServer,
  setDoc,
  updateDoc,
  writeBatch,
} from '../firebase/firebaseClient';

export interface TenantDomainResolution {
  host: string;
  tenantId: string;
  enabled: boolean;
}

export interface TenantDomainMapping {
  hostname: string;
  tenantId: string;
  /** Legacy + UI toggle: mirrors isActive for new writes */
  enabled: boolean;
  /** Preferred flag per SaaS model; false disables resolution */
  isActive: boolean;
  isPrimary: boolean;
}

/** Single source for whether a domain document allows resolution (supports legacy `enabled` + `isActive`). */
export function isTenantDomainDocActive(data: Record<string, unknown>): boolean {
  if (data.enabled === false) return false;
  if (data.isActive === false) return false;
  return true;
}

export function normalizeHost(hostInput: string): string {
  const raw = hostInput.trim().toLowerCase();
  if (!raw) return '';

  try {
    const parsed = new URL(raw.includes('://') ? raw : `http://${raw}`);
    const hostname = parsed.hostname.toLowerCase();
    return hostname.endsWith('.') ? hostname.slice(0, -1) : hostname;
  } catch {
    const withoutPort = raw.includes(':') ? raw.split(':')[0] : raw;
    return withoutPort.endsWith('.') ? withoutPort.slice(0, -1) : withoutPort;
  }
}

function isLocalHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]';
}

/** Same hostname variants as `resolveTenantByHostname` (apex ↔ www) for consistent tenant context. */
function tenantDomainDocCandidates(host: string): string[] {
  if (!host) return [];
  if (host.startsWith('www.')) {
    return [host, host.slice(4)];
  }
  return [host, `www.${host}`];
}

export function isValidHostname(hostname: string): boolean {
  if (!hostname) return false;
  if (hostname.length > 253) return false;
  const parts = hostname.split('.');
  if (parts.length < 2) return false;

  return parts.every((label) => {
    if (!label || label.length > 63) return false;
    if (label.startsWith('-') || label.endsWith('-')) return false;
    return /^[a-z0-9-]+$/.test(label);
  });
}

async function reconcilePrimaryFlagsForTenant(primaryHostname: string, tenantId: string): Promise<void> {
  const rows = await listTenantDomains();
  const batch = writeBatch(db);
  let ops = 0;
  for (const row of rows) {
    if (row.tenantId !== tenantId) continue;
    const shouldPrimary = row.hostname === primaryHostname;
    batch.update(doc(collection(db, 'tenantDomains'), row.hostname), { isPrimary: shouldPrimary });
    ops += 1;
  }
  if (ops > 0) {
    await batch.commit();
  }
}

export async function listTenantDomains(): Promise<TenantDomainMapping[]> {
  const snapshot = await getDocsFromServer(collection(db, 'tenantDomains'));
  const rows: TenantDomainMapping[] = [];

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as Record<string, unknown>;
    const tenantId = typeof data.tenantId === 'string' ? data.tenantId.trim() : '';
    if (!tenantId) continue;
    const active = isTenantDomainDocActive(data);
    rows.push({
      hostname: docSnap.id,
      tenantId,
      enabled: active,
      isActive: active,
      isPrimary: data.isPrimary === true,
    });
  }

  rows.sort((a, b) => a.hostname.localeCompare(b.hostname));
  return rows;
}

export async function createTenantDomainMapping(input: {
  hostname: string;
  tenantId: string;
  enabled: boolean;
  isPrimary?: boolean;
}): Promise<TenantDomainMapping> {
  const hostname = normalizeHost(input.hostname);
  const tenantId = input.tenantId.trim();
  if (!hostname) throw new Error('Hostname is required.');
  if (!tenantId) throw new Error('Tenant ID is required.');
  if (!isValidHostname(hostname)) throw new Error('Hostname format is invalid.');

  const ref = doc(collection(db, 'tenantDomains'), hostname);
  const existing = await getDocFromServer(ref);
  if (existing.exists()) {
    throw new Error('Hostname mapping already exists.');
  }

  const active = input.enabled !== false;
  const payload: Record<string, unknown> = {
    tenantId,
    enabled: active,
    isActive: active,
    /** Always stored explicitly so docs are unambiguous (single primary is enforced via reconcile). */
    isPrimary: input.isPrimary === true,
  };
  await setDoc(ref, payload);

  if (input.isPrimary === true) {
    await reconcilePrimaryFlagsForTenant(hostname, tenantId);
  }

  return {
    hostname,
    tenantId,
    enabled: active,
    isActive: active,
    isPrimary: input.isPrimary === true,
  };
}

export async function updateTenantDomainMapping(hostnameInput: string, updates: {
  tenantId: string;
  enabled: boolean;
}): Promise<void> {
  const hostname = normalizeHost(hostnameInput);
  if (!hostname) throw new Error('Hostname is required.');
  const tenantId = updates.tenantId.trim();
  if (!tenantId) throw new Error('Tenant ID is required.');

  const active = updates.enabled !== false;
  await updateDoc(doc(collection(db, 'tenantDomains'), hostname), {
    tenantId,
    enabled: active,
    isActive: active,
  });
}

export async function setTenantDomainEnabled(hostnameInput: string, enabled: boolean): Promise<void> {
  const hostname = normalizeHost(hostnameInput);
  if (!hostname) throw new Error('Hostname is required.');
  const active = enabled !== false;
  await updateDoc(doc(collection(db, 'tenantDomains'), hostname), {
    enabled: active,
    isActive: active,
  });
}

export async function setTenantDomainPrimary(hostnameInput: string): Promise<void> {
  const hostname = normalizeHost(hostnameInput);
  if (!hostname) throw new Error('Hostname is required.');
  const ref = doc(collection(db, 'tenantDomains'), hostname);
  const snap = await getDocFromServer(ref);
  if (!snap.exists()) throw new Error('Hostname mapping not found.');
  const data = snap.data() as Record<string, unknown>;
  const tenantId = typeof data.tenantId === 'string' ? data.tenantId.trim() : '';
  if (!tenantId) throw new Error('Invalid mapping.');
  await reconcilePrimaryFlagsForTenant(hostname, tenantId);
}

export async function replaceTenantDomainHostname(input: {
  currentHostname: string;
  nextHostname: string;
  tenantId: string;
  enabled: boolean;
}): Promise<TenantDomainMapping> {
  const currentHostname = normalizeHost(input.currentHostname);
  const nextHostname = normalizeHost(input.nextHostname);
  const tenantId = input.tenantId.trim();

  if (!currentHostname || !nextHostname) throw new Error('Hostname is required.');
  if (!tenantId) throw new Error('Tenant ID is required.');
  if (!isValidHostname(nextHostname)) throw new Error('Hostname format is invalid.');

  const active = input.enabled !== false;

  const currentRef = doc(collection(db, 'tenantDomains'), currentHostname);
  const currentSnap = await getDocFromServer(currentRef);
  const prevData = currentSnap.exists() ? (currentSnap.data() as Record<string, unknown>) : {};
  const wasPrimary = prevData.isPrimary === true;

  if (currentHostname === nextHostname) {
    await updateTenantDomainMapping(currentHostname, { tenantId, enabled: input.enabled });
    return {
      hostname: currentHostname,
      tenantId,
      enabled: active,
      isActive: active,
      isPrimary: wasPrimary,
    };
  }

  const nextRef = doc(collection(db, 'tenantDomains'), nextHostname);
  const nextSnap = await getDocFromServer(nextRef);
  if (nextSnap.exists()) {
    throw new Error('Target hostname already exists.');
  }

  await setDoc(nextRef, {
    tenantId,
    enabled: active,
    isActive: active,
    isPrimary: wasPrimary,
  });
  await deleteDoc(currentRef);

  if (wasPrimary) {
    await reconcilePrimaryFlagsForTenant(nextHostname, tenantId);
  }

  return { hostname: nextHostname, tenantId, enabled: active, isActive: active, isPrimary: wasPrimary };
}

export async function deleteTenantDomainMapping(hostnameInput: string): Promise<void> {
  const hostname = normalizeHost(hostnameInput);
  if (!hostname) throw new Error('Hostname is required.');
  await deleteDoc(doc(collection(db, 'tenantDomains'), hostname));
}

export async function resolveTenantByHost(hostInput: string): Promise<TenantDomainResolution | null> {
  const host = normalizeHost(hostInput);
  if (!host) return null;
  if (isLocalHost(host)) return null;

  const tenantDomainsRef = collection(db, 'tenantDomains');
  for (const candidate of tenantDomainDocCandidates(host)) {
    const snap = await getDocFromServer(doc(tenantDomainsRef, candidate));
    if (!snap.exists()) continue;

    const data = snap.data() as Record<string, unknown>;
    const tenantId = typeof data.tenantId === 'string' ? data.tenantId.trim() : '';
    const active = isTenantDomainDocActive(data);

    if (!tenantId || !active) continue;

    return {
      host,
      tenantId,
      enabled: true,
    };
  }

  return null;
}
