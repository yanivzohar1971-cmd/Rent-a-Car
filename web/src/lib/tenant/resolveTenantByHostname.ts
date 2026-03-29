import { collection, db, doc, getDocFromServer } from '../../firebase/firebaseClient';
import { isTenantDomainDocActive } from '../../api/tenantDomainsApi';

export interface ResolvedTenantByHostname {
  hostname: string;
  normalizedHostname: string;
  isTenantHost: boolean;
  yardUid: string | null;
  tenantId: string | null;
  source: 'firestore' | 'default' | 'none';
}

const DEFAULT_MARKETPLACE_HOSTS = new Set([
  '',
  'localhost',
  '127.0.0.1',
  '::1',
  '[::1]',
  'app.local',
]);

const memoryCache = new Map<string, ResolvedTenantByHostname>();

function normalizeHostname(hostnameInput: string): string {
  const raw = hostnameInput.trim().toLowerCase();
  if (!raw) return '';
  return raw.endsWith('.') ? raw.slice(0, -1) : raw;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function getSessionCacheKey(hostname: string): string {
  return `tenant-resolution:v1:${hostname}`;
}

function readSessionCache(hostname: string): ResolvedTenantByHostname | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(getSessionCacheKey(hostname));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ResolvedTenantByHostname;
    if (!parsed || parsed.normalizedHostname !== hostname) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSessionCache(result: ResolvedTenantByHostname): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(getSessionCacheKey(result.normalizedHostname), JSON.stringify(result));
  } catch {
    // Ignore storage failures
  }
}

function withWwwVariants(hostname: string): string[] {
  if (!hostname) return [''];
  if (hostname.startsWith('www.')) {
    return [hostname, hostname.slice(4)];
  }
  return [hostname, `www.${hostname}`];
}

async function readTenantDomainRecord(hostname: string): Promise<{ tenantId: string | null; sourceHostname: string | null }> {
  const variants = withWwwVariants(hostname);
  const tenantDomainsRef = collection(db, 'tenantDomains');

  for (const candidate of variants) {
    const snap = await getDocFromServer(doc(tenantDomainsRef, candidate));
    if (!snap.exists()) continue;

    const data = snap.data() as Record<string, unknown>;
    if (!isTenantDomainDocActive(data)) continue;

    const tenantId = asTrimmedString(data.tenantId);
    if (tenantId) {
      return { tenantId, sourceHostname: candidate };
    }
  }

  return { tenantId: null, sourceHostname: null };
}

async function readTenantYardUid(tenantId: string): Promise<string | null> {
  const tenantConfigsRef = collection(db, 'tenantSiteConfigs');
  const snap = await getDocFromServer(doc(tenantConfigsRef, tenantId));
  if (!snap.exists()) return null;

  const data = snap.data() as Record<string, unknown>;
  const dataScope = typeof data.dataScope === 'object' && data.dataScope !== null ? (data.dataScope as Record<string, unknown>) : {};

  return asTrimmedString(dataScope.yardUid) ?? asTrimmedString(dataScope.yardId);
}

export async function resolveTenantByHostname(hostnameInput: string): Promise<ResolvedTenantByHostname> {
  const normalizedHostname = normalizeHostname(hostnameInput);

  const memoryHit = memoryCache.get(normalizedHostname);
  if (memoryHit) return memoryHit;

  const sessionHit = readSessionCache(normalizedHostname);
  if (sessionHit) {
    memoryCache.set(normalizedHostname, sessionHit);
    return sessionHit;
  }

  if (DEFAULT_MARKETPLACE_HOSTS.has(normalizedHostname)) {
    const result: ResolvedTenantByHostname = {
      hostname: hostnameInput,
      normalizedHostname,
      isTenantHost: false,
      yardUid: null,
      tenantId: null,
      source: 'default',
    };
    memoryCache.set(normalizedHostname, result);
    writeSessionCache(result);
    return result;
  }

  try {
    const { tenantId } = await readTenantDomainRecord(normalizedHostname);
    if (!tenantId) {
      const result: ResolvedTenantByHostname = {
        hostname: hostnameInput,
        normalizedHostname,
        isTenantHost: false,
        yardUid: null,
        tenantId: null,
        source: 'none',
      };
      memoryCache.set(normalizedHostname, result);
      writeSessionCache(result);
      return result;
    }

    const yardUid = await readTenantYardUid(tenantId);
    const result: ResolvedTenantByHostname = {
      hostname: hostnameInput,
      normalizedHostname,
      isTenantHost: Boolean(yardUid),
      yardUid,
      tenantId,
      source: 'firestore',
    };
    memoryCache.set(normalizedHostname, result);
    writeSessionCache(result);
    return result;
  } catch {
    const result: ResolvedTenantByHostname = {
      hostname: hostnameInput,
      normalizedHostname,
      isTenantHost: false,
      yardUid: null,
      tenantId: null,
      source: 'none',
    };
    memoryCache.set(normalizedHostname, result);
    writeSessionCache(result);
    return result;
  }
}
