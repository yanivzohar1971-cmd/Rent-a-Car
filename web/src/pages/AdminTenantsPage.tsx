import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  BASIC_PLAN_MAX_CARS,
  createTenantRecord,
  extendTenantTrial,
  listTenants,
  syncTenantPublicLifecycleFromRows,
  type Tenant,
  type TenantPlan,
  type TenantStatus,
  updateTenantRecord,
} from '../api/tenantsApi';
import {
  createTenantDomainMapping,
  isValidHostname,
  listTenantDomains,
  normalizeHost,
  type TenantDomainMapping,
} from '../api/tenantDomainsApi';
import AdminTenantDomainsSection from '../components/admin/AdminTenantDomainsSection';
import './AdminTenantsPage.css';
import '../components/admin/AdminTenantDomainsSection.css';

function formatTs(t: Tenant['createdAt']): string {
  if (!t) return '—';
  try {
    return t.toDate().toLocaleString('he-IL');
  } catch {
    return '—';
  }
}

function statusBadgeClass(s: TenantStatus): string {
  if (s === 'active') return 'admin-tenants-badge admin-tenants-badge--active';
  if (s === 'trial') return 'admin-tenants-badge admin-tenants-badge--trial';
  return 'admin-tenants-badge admin-tenants-badge--blocked';
}

function planLabel(p: TenantPlan): string {
  if (p === 'basic') return 'Basic';
  if (p === 'pro') return 'Pro';
  return 'Enterprise';
}

export default function AdminTenantsPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isAdmin = userProfile?.isAdmin === true;

  const [rows, setRows] = useState<Tenant[]>([]);
  const [domains, setDomains] = useState<TenantDomainMapping[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createDomain, setCreateDomain] = useState('');
  const [createPlan, setCreatePlan] = useState<TenantPlan>('basic');
  const [createStatus, setCreateStatus] = useState<TenantStatus>('trial');
  const [createTrialDays, setCreateTrialDays] = useState(14);

  const [editName, setEditName] = useState('');
  const [editPlan, setEditPlan] = useState<TenantPlan>('basic');
  const [editStatus, setEditStatus] = useState<TenantStatus>('trial');
  const [editTrialEnd, setEditTrialEnd] = useState('');
  const [editSubEnd, setEditSubEnd] = useState('');

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tList, dList] = await Promise.all([listTenants(), listTenantDomains()]);
      await syncTenantPublicLifecycleFromRows(tList);
      setRows(tList);
      setDomains(dList);
    } catch {
      setError('טעינת לקוחות נכשלה.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [authLoading, firebaseUser, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    void loadAll();
  }, [isAdmin, loadAll]);

  const refreshDomainsOnly = useCallback(async () => {
    try {
      const dList = await listTenantDomains();
      setDomains(dList);
    } catch {
      setError('רענון דומיינים נכשל.');
    }
  }, []);

  useEffect(() => {
    if (!selected) return;
    setEditName(selected.name);
    setEditPlan(selected.plan);
    setEditStatus(selected.status);
    const te = selected.trialEndsAt;
    setEditTrialEnd(te ? te.toDate().toISOString().slice(0, 10) : '');
    const se = selected.subscriptionEndsAt;
    setEditSubEnd(se ? se.toDate().toISOString().slice(0, 10) : '');
  }, [selected]);

  const openCreate = () => {
    setError(null);
    setSuccess(null);
    setCreateName('');
    setCreateDomain('');
    setCreatePlan('basic');
    setCreateStatus('trial');
    setCreateTrialDays(14);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { tenantId } = await createTenantRecord({
        name: createName,
        plan: createPlan,
        status: createStatus,
        trialDays: createTrialDays,
      });
      const domainRaw = createDomain.trim();
      if (domainRaw) {
        const host = normalizeHost(domainRaw);
        if (!isValidHostname(host)) {
          throw new Error('פורמט דומיין לא תקין');
        }
        await createTenantDomainMapping({
          hostname: host,
          tenantId,
          enabled: true,
          isPrimary: false,
        });
      }
      setCreateOpen(false);
      setSuccess('הלקוח נוצר.');
      await loadAll();
      setSelectedId(tenantId);
      navigate(`/admin/tenant-site-builder?tenantId=${encodeURIComponent(tenantId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'יצירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await updateTenantRecord(selectedId, {
        name: editName,
        plan: editPlan,
        status: editStatus,
        trialEndsAt: editTrialEnd ? new Date(`${editTrialEnd}T12:00:00`) : null,
        subscriptionEndsAt: editSubEnd ? new Date(`${editSubEnd}T12:00:00`) : null,
      });
      setSuccess('נשמר.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שמירה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const quickActivate = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await updateTenantRecord(id, { status: 'active', isBlocked: false });
      setSuccess('הופעל.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'פעולה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const quickBlock = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await updateTenantRecord(id, { status: 'blocked', isBlocked: true });
      setSuccess('נחסם.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'פעולה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  const quickExtendTrial = async (id: string) => {
    setSaving(true);
    setError(null);
    try {
      await extendTenantTrial(id, 7);
      setSuccess('ניסיון הוארך ב־7 ימים.');
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'פעולה נכשלה');
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="admin-tenants">
      <div className="admin-tenants-hero">
        <div>
          <h1>לקוחות SaaS (Tenants)</h1>
          <p className="admin-tenants-lead">
            בקרת מנויים, ניסיון, חסימה ודומיינים — ללא תשלום אוטומטי (Stripe בשלב הבא).
          </p>
        </div>
        <div className="admin-tenants-hero-actions">
          <button type="button" className="admin-tenants-btn admin-tenants-btn--primary" onClick={openCreate} disabled={saving}>
            + לקוח חדש
          </button>
          <button type="button" className="admin-tenants-btn" onClick={() => void loadAll()} disabled={loading || saving}>
            רענון
          </button>
        </div>
      </div>

      {error ? <div className="admin-tenants-alert admin-tenants-alert--error">{error}</div> : null}
      {success ? <div className="admin-tenants-alert admin-tenants-alert--ok">{success}</div> : null}

      <div className="admin-tenants-grid">
        <section className="admin-tenants-panel admin-tenants-panel--list">
          <h2>רשימה</h2>
          {loading ? <p>טוען…</p> : null}
          <div className="admin-tenants-table-wrap">
            <table className="admin-tenants-table">
              <thead>
                <tr>
                  <th>שם</th>
                  <th>מזהה</th>
                  <th>תוכנית</th>
                  <th>סטטוס</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className={selectedId === r.id ? 'admin-tenants-row--selected' : undefined}
                    onClick={() => setSelectedId(r.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(r.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                  >
                    <td>{r.name}</td>
                    <td>
                      <code className="admin-tenants-mono">{r.id}</code>
                    </td>
                    <td>{planLabel(r.plan)}</td>
                    <td>
                      <span className={statusBadgeClass(r.status)}>{r.status.toUpperCase()}</span>
                    </td>
                    <td className="admin-tenants-td-actions">
                      <button
                        type="button"
                        className="admin-tenants-linkbtn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void quickActivate(r.id);
                        }}
                        disabled={saving}
                      >
                        הפעל
                      </button>
                      <button
                        type="button"
                        className="admin-tenants-linkbtn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void quickBlock(r.id);
                        }}
                        disabled={saving}
                      >
                        חסום
                      </button>
                      <button
                        type="button"
                        className="admin-tenants-linkbtn"
                        onClick={(e) => {
                          e.stopPropagation();
                          void quickExtendTrial(r.id);
                        }}
                        disabled={saving}
                      >
                        +7 יום ניסיון
                      </button>
                      <Link
                        to={`/admin/tenant-site-builder?tenantId=${encodeURIComponent(r.id)}`}
                        className="admin-tenants-linkbtn"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Builder
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="admin-tenants-panel admin-tenants-panel--detail">
          <h2>פרטים ודומיינים</h2>
          {!selected ? <p className="admin-tenants-muted">בחרו שורה מהרשימה.</p> : null}
          {selected ? (
            <>
              <div className="admin-tenants-form-grid">
                <label>
                  שם
                  <input value={editName} onChange={(e) => setEditName(e.target.value)} disabled={saving} />
                </label>
                <label>
                  תוכנית
                  <select value={editPlan} onChange={(e) => setEditPlan(e.target.value as TenantPlan)} disabled={saving}>
                    <option value="basic">Basic (עד {BASIC_PLAN_MAX_CARS} רכבים — אזהרת UI)</option>
                    <option value="pro">Pro</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </label>
                <label>
                  סטטוס
                  <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as TenantStatus)} disabled={saving}>
                    <option value="trial">trial</option>
                    <option value="active">active</option>
                    <option value="blocked">blocked</option>
                  </select>
                </label>
                <label>
                  סוף ניסיון
                  <input type="date" value={editTrialEnd} onChange={(e) => setEditTrialEnd(e.target.value)} disabled={saving} />
                </label>
                <label>
                  סוף מנוי
                  <input type="date" value={editSubEnd} onChange={(e) => setEditSubEnd(e.target.value)} disabled={saving} />
                </label>
              </div>
              <p className="admin-tenants-meta">
                נוצר: {formatTs(selected.createdAt)} · מזהה: <code>{selected.id}</code>
              </p>
              <button type="button" className="admin-tenants-btn admin-tenants-btn--primary" onClick={() => void saveEdit()} disabled={saving}>
                שמור שינויים
              </button>

              <hr className="admin-tenants-hr" />

              <AdminTenantDomainsSection
                tenantId={selected.id}
                allDomains={domains}
                setAllDomains={setDomains}
                refreshDomains={refreshDomainsOnly}
                saving={saving}
                setSaving={setSaving}
                setError={setError}
                setSuccess={setSuccess}
              />
            </>
          ) : null}
        </section>
      </div>

      {createOpen ? (
        <div className="admin-tenants-modal-backdrop" role="presentation" onClick={() => !saving && setCreateOpen(false)}>
          <div
            className="admin-tenants-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>לקוח חדש</h2>
            <label>
              שם הלקוח
              <input value={createName} onChange={(e) => setCreateName(e.target.value)} disabled={saving} />
            </label>
            <label>
              דומיין (אופציונלי)
              <input value={createDomain} onChange={(e) => setCreateDomain(e.target.value)} placeholder="rent.example.com" disabled={saving} />
            </label>
            <label>
              תוכנית
              <select value={createPlan} onChange={(e) => setCreatePlan(e.target.value as TenantPlan)} disabled={saving}>
                <option value="basic">basic</option>
                <option value="pro">pro</option>
                <option value="enterprise">enterprise</option>
              </select>
            </label>
            <label>
              סטטוס התחלתי
              <select value={createStatus} onChange={(e) => setCreateStatus(e.target.value as TenantStatus)} disabled={saving}>
                <option value="trial">trial</option>
                <option value="active">active</option>
                <option value="blocked">blocked</option>
              </select>
            </label>
            {createStatus === 'trial' ? (
              <label>
                אורך ניסיון (ימים)
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={createTrialDays}
                  onChange={(e) => setCreateTrialDays(Number(e.target.value) || 14)}
                  disabled={saving}
                />
              </label>
            ) : null}
            <div className="admin-tenants-modal-actions">
              <button type="button" className="admin-tenants-btn" onClick={() => setCreateOpen(false)} disabled={saving}>
                ביטול
              </button>
              <button type="button" className="admin-tenants-btn admin-tenants-btn--primary" onClick={() => void handleCreate()} disabled={saving || !createName.trim()}>
                צור והמשך ל-Builder
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
