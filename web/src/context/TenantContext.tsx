import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveTenantByHost, type TenantDomainResolution } from '../api/tenantDomainsApi';
import { getTenantSiteConfigByTenantId, type TenantSiteConfig } from '../api/tenantSiteConfigsApi';
import { loadYardPublicProfile, type YardProfileData } from '../api/yardProfileApi';
import { normalizeTenantSiteConfig } from '../tenant/tenantSiteConfig';
import {
  computeTenantPublicSiteSuspended,
  computeTenantTrialEndingSoon,
  getTenantPublicLifecycleForStorefront,
  type Tenant,
  type TenantPublicSuspendReason,
} from '../api/tenantsApi';
import { resolveTenantByHostname } from '../lib/tenant/resolveTenantByHostname';

const TENANT_LOOKUP_TIMEOUT_MS = 2500;

/** Public preview URL: `/tenant/{tenantId}` (basename-relative pathname from React Router). */
function parseTenantIdFromPublicPreviewPath(pathname: string): string | null {
  const m = pathname.match(/^\/tenant\/([^/]+)\/?$/);
  if (!m) return null;
  const id = decodeURIComponent(m[1]).trim();
  return id || null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), timeoutMs);
    }),
  ]);
}

type TenantResolutionStatus = 'idle' | 'loading' | 'resolved' | 'unresolved';

export type TenantLifecycleBanner = {
  variant: 'error' | 'warning';
  message: string;
};

interface TenantContextValue {
  domainStatus: TenantResolutionStatus;
  tenantId: string | null;
  siteConfig: TenantSiteConfig | null;
  isTenantHostByHostname: boolean;
  hostnameYardUid: string | null;
  isLoading: boolean;
  error: string | null;
  status: TenantResolutionStatus;
  host: string;
  tenant: TenantDomainResolution | null;
  /** SaaS lifecycle doc when present */
  tenantRecord: Tenant | null;
  tenantLifecycleLoading: boolean;
  /** True when this storefront should not show inventory (blocked / expired trial or subscription). */
  tenantPublicSiteSuspended: boolean;
  tenantSuspendReason: TenantPublicSuspendReason | null;
  /** Warning / inactive strip for tenant hosts */
  tenantLifecycleBanner: TenantLifecycleBanner | null;
  /** Public yard profile when dataScope.yardUid is set — used for logo/contact fallbacks */
  yardPublicProfile: YardProfileData | null;
}

const TenantContext = createContext<TenantContextValue>({
  domainStatus: 'idle',
  tenantId: null,
  siteConfig: null,
  isTenantHostByHostname: false,
  hostnameYardUid: null,
  isLoading: false,
  error: null,
  status: 'idle',
  host: '',
  tenant: null,
  tenantRecord: null,
  tenantLifecycleLoading: false,
  tenantPublicSiteSuspended: false,
  tenantSuspendReason: null,
  tenantLifecycleBanner: null,
  yardPublicProfile: null,
});

export function TenantProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const pathTenantId = useMemo(
    () => parseTenantIdFromPublicPreviewPath(location.pathname),
    [location.pathname],
  );

  const [domainStatus, setDomainStatus] = useState<TenantResolutionStatus>('loading');
  const [tenant, setTenant] = useState<TenantDomainResolution | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [siteConfig, setSiteConfig] = useState<TenantSiteConfig | null>(null);
  const [isTenantHostByHostname, setIsTenantHostByHostname] = useState<boolean>(false);
  const [hostnameYardUid, setHostnameYardUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tenantRecord, setTenantRecord] = useState<Tenant | null>(null);
  const [tenantLifecycleLoading, setTenantLifecycleLoading] = useState(false);
  const [tenantPublicSiteSuspended, setTenantPublicSiteSuspended] = useState(false);
  const [tenantSuspendReason, setTenantSuspendReason] = useState<TenantPublicSuspendReason | null>(null);
  const [yardPublicProfile, setYardPublicProfile] = useState<YardProfileData | null>(null);

  const host = typeof window !== 'undefined' ? window.location.hostname : '';

  useEffect(() => {
    let isCancelled = false;

    resolveTenantByHostname(host).then((resolvedByHostname) => {
      if (isCancelled) return;
      setIsTenantHostByHostname(resolvedByHostname.isTenantHost);
      setHostnameYardUid(resolvedByHostname.yardUid);

      if (import.meta.env.DEV) {
        console.debug('Tenant resolved:', {
          hostname: resolvedByHostname.normalizedHostname,
          yardUid: resolvedByHostname.yardUid,
          tenantId: resolvedByHostname.tenantId,
          source: resolvedByHostname.source,
          fallback: resolvedByHostname.source !== 'firestore',
        });
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [host]);

  useEffect(() => {
    let isCancelled = false;

    const resolveTenantRuntime = async () => {
      setIsLoading(true);
      setError(null);
      setSiteConfig(null);
      setTenantId(null);
      setDomainStatus('loading');
      setTenantRecord(null);
      setTenantLifecycleLoading(false);
      setTenantPublicSiteSuspended(false);
      setTenantSuspendReason(null);

      try {
        let resolvedTenant: TenantDomainResolution | null = null;
        if (pathTenantId) {
          resolvedTenant = { host, tenantId: pathTenantId, enabled: true };
        } else {
          resolvedTenant = await withTimeout(resolveTenantByHost(host), TENANT_LOOKUP_TIMEOUT_MS);
        }
        if (isCancelled) return;

        setTenant(resolvedTenant);

        if (!resolvedTenant) {
          setDomainStatus('unresolved');
          setIsLoading(false);
          return;
        }

        setTenantId(resolvedTenant.tenantId);
        setDomainStatus('resolved');

        try {
          const config = await withTimeout(getTenantSiteConfigByTenantId(resolvedTenant.tenantId), TENANT_LOOKUP_TIMEOUT_MS);
          if (isCancelled) return;
          setSiteConfig(config);
        } catch {
          if (isCancelled) return;
          setError('Failed to load tenant site config');
          setSiteConfig(null);
        }

        setTenantLifecycleLoading(true);
        try {
          const record = await withTimeout(
            getTenantPublicLifecycleForStorefront(resolvedTenant.tenantId),
            TENANT_LOOKUP_TIMEOUT_MS,
          );
          if (isCancelled) return;
          setTenantRecord(record);
          const now = Date.now();
          const { suspended, reason } = computeTenantPublicSiteSuspended(record, now);
          setTenantPublicSiteSuspended(suspended);
          setTenantSuspendReason(reason);
        } catch {
          if (isCancelled) return;
          setTenantRecord(null);
          setTenantPublicSiteSuspended(false);
          setTenantSuspendReason(null);
        } finally {
          if (!isCancelled) setTenantLifecycleLoading(false);
        }
      } catch {
        if (isCancelled) return;
        setTenant(null);
        setDomainStatus('unresolved');
      } finally {
        if (isCancelled) return;
        setIsLoading(false);
      }
    };

    resolveTenantRuntime();

    return () => {
      isCancelled = true;
    };
  }, [host, pathTenantId]);

  useEffect(() => {
    if (!siteConfig || !tenantId) {
      setYardPublicProfile(null);
      return;
    }
    const n = normalizeTenantSiteConfig(siteConfig, tenantId);
    const y = n.dataScope.yardUid?.trim();
    if (!y) {
      setYardPublicProfile(null);
      return;
    }
    let cancelled = false;
    loadYardPublicProfile(y)
      .then((p) => {
        if (!cancelled) setYardPublicProfile(p);
      })
      .catch(() => {
        if (!cancelled) setYardPublicProfile(null);
      });
    return () => {
      cancelled = true;
    };
  }, [siteConfig, tenantId]);

  const tenantLifecycleBanner = useMemo((): TenantLifecycleBanner | null => {
    if (domainStatus !== 'resolved' || !tenantId) return null;
    const now = Date.now();
    if (tenantPublicSiteSuspended) {
      if (tenantSuspendReason === 'blocked') {
        return { variant: 'error', message: 'האתר אינו פעיל כרגע. לפרטים נוספים צרו קשר עם בעל העסק.' };
      }
      if (tenantSuspendReason === 'trial_expired') {
        return { variant: 'error', message: 'תקופת הניסיון הסתיימה — האתר אינו מציג מלאי.' };
      }
      if (tenantSuspendReason === 'subscription_expired') {
        return { variant: 'error', message: 'המנוי פג תוקף — האתר אינו מציג מלאי.' };
      }
      return { variant: 'error', message: 'האתר אינו פעיל כרגע.' };
    }
    if (tenantRecord && computeTenantTrialEndingSoon(tenantRecord, now, 72 * 60 * 60 * 1000)) {
      return { variant: 'warning', message: 'תקופת הניסיון מסתיימת בקרוב — חידשו מנוי כדי למנוע השבתה.' };
    }
    return null;
  }, [domainStatus, tenantId, tenantPublicSiteSuspended, tenantSuspendReason, tenantRecord]);

  const value = useMemo(
    () => ({
      domainStatus,
      tenantId,
      siteConfig,
      isTenantHostByHostname,
      hostnameYardUid,
      isLoading,
      error,
      status: domainStatus,
      host,
      tenant,
      tenantRecord,
      tenantLifecycleLoading,
      tenantPublicSiteSuspended,
      tenantSuspendReason,
      tenantLifecycleBanner,
      yardPublicProfile,
    }),
    [
      domainStatus,
      tenantId,
      siteConfig,
      isTenantHostByHostname,
      hostnameYardUid,
      isLoading,
      error,
      host,
      tenant,
      tenantRecord,
      tenantLifecycleLoading,
      tenantPublicSiteSuspended,
      tenantSuspendReason,
      tenantLifecycleBanner,
      yardPublicProfile,
    ],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  return useContext(TenantContext);
}
