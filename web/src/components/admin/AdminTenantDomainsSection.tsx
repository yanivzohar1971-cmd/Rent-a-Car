import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import {
  createTenantDomainMapping,
  deleteTenantDomainMapping,
  isValidHostname,
  normalizeHost,
  setTenantDomainEnabled,
  setTenantDomainPrimary,
  type TenantDomainMapping,
} from '../../api/tenantDomainsApi';

function mergeTenantDomains(
  all: TenantDomainMapping[],
  tenantId: string,
  nextForTenant: TenantDomainMapping[],
): TenantDomainMapping[] {
  const rest = all.filter((d) => d.tenantId !== tenantId);
  return [...rest, ...nextForTenant].sort((a, b) => a.hostname.localeCompare(b.hostname));
}

export type AdminTenantDomainsSectionProps = {
  tenantId: string;
  allDomains: TenantDomainMapping[];
  setAllDomains: Dispatch<SetStateAction<TenantDomainMapping[]>>;
  refreshDomains: () => Promise<void>;
  saving: boolean;
  setSaving: (v: boolean) => void;
  setError: (msg: string | null) => void;
  setSuccess: (msg: string | null) => void;
};

export default function AdminTenantDomainsSection({
  tenantId,
  allDomains,
  setAllDomains,
  refreshDomains,
  saving,
  setSaving,
  setError,
  setSuccess,
}: AdminTenantDomainsSectionProps) {
  const [newHost, setNewHost] = useState('');

  const rows = useMemo(
    () => allDomains.filter((d) => d.tenantId === tenantId).sort((a, b) => a.hostname.localeCompare(b.hostname)),
    [allDomains, tenantId],
  );

  const addDomain = async () => {
    const host = normalizeHost(newHost);
    if (!host) {
      setError('יש להזין דומיין.');
      return;
    }
    if (!isValidHostname(host)) {
      setError('פורמט דומיין לא תקין.');
      return;
    }
    if (allDomains.some((d) => d.hostname === host)) {
      setError('דומיין זה כבר קיים במערכת.');
      return;
    }

    const optimistic: TenantDomainMapping = {
      hostname: host,
      tenantId,
      enabled: true,
      isActive: true,
      isPrimary: false,
    };

    setError(null);
    setSuccess(null);
    setSaving(true);
    setAllDomains((prev) => mergeTenantDomains(prev, tenantId, [...prev.filter((d) => d.tenantId === tenantId), optimistic]));

    try {
      await createTenantDomainMapping({
        hostname: host,
        tenantId,
        enabled: true,
        isPrimary: false,
      });
      setNewHost('');
      setSuccess('דומיין נוסף.');
      await refreshDomains();
    } catch (e) {
      await refreshDomains();
      setError(e instanceof Error ? e.message : 'הוספה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const removeDomain = async (hostname: string) => {
    if (!window.confirm(`למחוק את הדומיין ${hostname}?`)) return;
    setError(null);
    setSuccess(null);
    setSaving(true);
    const prevSnapshot = allDomains;
    setAllDomains((prev) => prev.filter((d) => d.hostname !== hostname));
    try {
      await deleteTenantDomainMapping(hostname);
      setSuccess('דומיין הוסר.');
      await refreshDomains();
    } catch (e) {
      setAllDomains(prevSnapshot);
      setError(e instanceof Error ? e.message : 'מחיקה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (hostname: string, next: boolean) => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    const prevSnapshot = allDomains;
    setAllDomains((prev) =>
      prev.map((d) => (d.hostname === hostname ? { ...d, isActive: next, enabled: next } : d)),
    );
    try {
      await setTenantDomainEnabled(hostname, next);
      setSuccess('עודכן.');
      await refreshDomains();
    } catch (e) {
      setAllDomains(prevSnapshot);
      setError(e instanceof Error ? e.message : 'עדכון נכשל');
    } finally {
      setSaving(false);
    }
  };

  const markPrimary = async (hostname: string) => {
    setError(null);
    setSuccess(null);
    setSaving(true);
    const prevSnapshot = allDomains;
    setAllDomains((prev) =>
      prev.map((d) =>
        d.tenantId === tenantId
          ? { ...d, isPrimary: d.hostname === hostname }
          : d,
      ),
    );
    try {
      await setTenantDomainPrimary(hostname);
      setSuccess('דומיין ראשי עודכן.');
      await refreshDomains();
    } catch (e) {
      setAllDomains(prevSnapshot);
      setError(e instanceof Error ? e.message : 'עדכון נכשל');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-tenant-domains">
      <h3 className="admin-tenant-domains__title">דומיינים</h3>
      <p className="admin-tenant-domains__hint">
        ניהול מלא על ידי אדמין בלבד. כל שורה היא מסמך <code>tenantDomains/&lt;hostname&gt;</code>. אפקס ו־www הם שני hostnames נפרדים — לא נוצרים אוטומטית.
      </p>

      <div className="admin-tenant-domains__add">
        <input
          className="admin-tenant-domains__input"
          placeholder="למשל client.co.il או www.client.co.il"
          value={newHost}
          onChange={(e) => setNewHost(e.target.value)}
          disabled={saving}
        />
        <button type="button" className="admin-tenants-btn" onClick={() => void addDomain()} disabled={saving}>
          הוסף דומיין
        </button>
      </div>

      <div className="admin-tenant-domains__table-wrap">
        <table className="admin-tenant-domains__table">
          <thead>
            <tr>
              <th>Hostname</th>
              <th>ראשי</th>
              <th>פעיל</th>
              <th>פעולות</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="admin-tenant-domains__empty">
                  אין דומיינים ללקוח זה.
                </td>
              </tr>
            ) : (
              rows.map((d) => (
                <tr key={d.hostname}>
                  <td>
                    <code className="admin-tenants-mono">{d.hostname}</code>
                  </td>
                  <td>{d.isPrimary ? <span className="admin-tenants-badge admin-tenants-badge--trial">PRIMARY</span> : '—'}</td>
                  <td>
                    <span className={d.isActive ? 'admin-tenants-badge admin-tenants-badge--active' : 'admin-tenants-badge admin-tenants-badge--blocked'}>
                      {d.isActive ? 'כן' : 'לא'}
                    </span>
                  </td>
                  <td className="admin-tenant-domains__actions">
                    <button
                      type="button"
                      className="admin-tenants-linkbtn"
                      onClick={() => void markPrimary(d.hostname)}
                      disabled={saving || d.isPrimary}
                    >
                      סמן ראשי
                    </button>
                    <button
                      type="button"
                      className="admin-tenants-linkbtn"
                      onClick={() => void toggleActive(d.hostname, !d.isActive)}
                      disabled={saving}
                    >
                      {d.isActive ? 'כבה' : 'הפעל'}
                    </button>
                    <button
                      type="button"
                      className="admin-tenants-linkbtn admin-tenants-linkbtn--danger"
                      onClick={() => void removeDomain(d.hostname)}
                      disabled={saving}
                    >
                      מחק
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
