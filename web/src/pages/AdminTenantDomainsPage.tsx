import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  createTenantDomainMapping,
  deleteTenantDomainMapping,
  isValidHostname,
  listTenantDomains,
  normalizeHost,
  replaceTenantDomainHostname,
  setTenantDomainEnabled,
  updateTenantDomainMapping,
  type TenantDomainMapping,
} from '../api/tenantDomainsApi';
import { getTenantSiteConfigByTenantId } from '../api/tenantSiteConfigsApi';
import './AdminTenantDomainsPage.css';

type ScopeInfo = {
  hasConfig: boolean;
  yardUid: string | null;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function extractYardUid(siteConfig: unknown): string | null {
  if (!siteConfig || typeof siteConfig !== 'object') return null;
  const root = siteConfig as Record<string, unknown>;
  const dataScope = root.dataScope && typeof root.dataScope === 'object' ? (root.dataScope as Record<string, unknown>) : {};
  return asTrimmedString(dataScope.yardUid) ?? asTrimmedString(dataScope.yardId);
}

export default function AdminTenantDomainsPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const isAdmin = userProfile?.isAdmin === true;

  const [rows, setRows] = useState<TenantDomainMapping[]>([]);
  const [scopes, setScopes] = useState<Record<string, ScopeInfo>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [editingHostname, setEditingHostname] = useState<string | null>(null);
  const [hostnameInput, setHostnameInput] = useState('');
  const [tenantIdInput, setTenantIdInput] = useState('');
  const [enabledInput, setEnabledInput] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [authLoading, firebaseUser, isAdmin, navigate]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const mappings = await listTenantDomains();
      setRows(mappings);

      const uniqueTenantIds = Array.from(new Set(mappings.map((x) => x.tenantId)));
      const nextScopes: Record<string, ScopeInfo> = {};
      await Promise.all(
        uniqueTenantIds.map(async (tenantId) => {
          try {
            const config = await getTenantSiteConfigByTenantId(tenantId);
            nextScopes[tenantId] = {
              hasConfig: Boolean(config),
              yardUid: extractYardUid(config),
            };
          } catch {
            nextScopes[tenantId] = {
              hasConfig: false,
              yardUid: null,
            };
          }
        }),
      );
      setScopes(nextScopes);
    } catch {
      setError('Failed loading tenant domains.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadData();
  }, [isAdmin]);

  const resetForm = () => {
    setEditingHostname(null);
    setHostnameInput('');
    setTenantIdInput('');
    setEnabledInput(true);
  };

  const startCreate = () => {
    setError(null);
    setSuccess(null);
    resetForm();
  };

  const startEdit = (row: TenantDomainMapping) => {
    setError(null);
    setSuccess(null);
    setEditingHostname(row.hostname);
    setHostnameInput(row.hostname);
    setTenantIdInput(row.tenantId);
    setEnabledInput(row.enabled);
  };

  const normalizedHostname = useMemo(() => normalizeHost(hostnameInput), [hostnameInput]);
  const isEditing = editingHostname !== null;

  const submit = async () => {
    if (saving) return;
    setError(null);
    setSuccess(null);
    const tenantId = tenantIdInput.trim();
    if (!normalizedHostname) {
      setError('Hostname is required.');
      return;
    }
    if (!tenantId) {
      setError('Tenant ID is required.');
      return;
    }
    if (!isValidHostname(normalizedHostname)) {
      setError('Hostname format is invalid.');
      return;
    }

    setSaving(true);
    try {
      if (!isEditing) {
        await createTenantDomainMapping({ hostname: normalizedHostname, tenantId, enabled: enabledInput });
        setSuccess('Domain mapping created.');
      } else if (editingHostname && normalizeHost(editingHostname) !== normalizedHostname) {
        if (!window.confirm('Changing hostname will perform safe replace (create new + delete old). Continue?')) {
          setSaving(false);
          return;
        }
        await replaceTenantDomainHostname({
          currentHostname: editingHostname,
          nextHostname: normalizedHostname,
          tenantId,
          enabled: enabledInput,
        });
        setSuccess('Domain mapping replaced safely.');
      } else if (editingHostname) {
        await updateTenantDomainMapping(editingHostname, {
          tenantId,
          enabled: enabledInput,
        });
        setSuccess('Domain mapping updated.');
      }
      await loadData();
      resetForm();
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const toggleEnabled = async (row: TenantDomainMapping) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await setTenantDomainEnabled(row.hostname, !row.enabled);
      setSuccess(row.enabled ? 'Domain disabled.' : 'Domain enabled.');
      await loadData();
    } catch {
      setError('Failed updating enabled state.');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (row: TenantDomainMapping) => {
    if (!window.confirm(`Delete domain mapping "${row.hostname}"?`)) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await deleteTenantDomainMapping(row.hostname);
      setSuccess('Domain mapping deleted.');
      await loadData();
      if (editingHostname === row.hostname) {
        resetForm();
      }
    } catch {
      setError('Delete failed.');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="admin-tenant-domains-page">
        <div className="page-container">
          <p>בודק הרשאות...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="admin-tenant-domains-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">Tenant Domains</h1>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/account')}>
            חזרה לאזור האישי
          </button>
        </div>

        <div className="card domain-form-card">
          <h3>{isEditing ? 'Edit Mapping' : 'Add Domain Mapping'}</h3>
          <div className="form-grid">
            <label>
              Hostname
              <input value={hostnameInput} onChange={(e) => setHostnameInput(e.target.value)} placeholder="example.com" />
            </label>
            <label>
              Tenant ID
              <input value={tenantIdInput} onChange={(e) => setTenantIdInput(e.target.value)} placeholder="tenant-id" />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" checked={enabledInput} onChange={(e) => setEnabledInput(e.target.checked)} />
              Enabled
            </label>
          </div>
          <div className="form-hints">
            <span>Normalized hostname: {normalizedHostname || '—'}</span>
            {hostnameInput.trim() && normalizedHostname !== hostnameInput.trim().toLowerCase() ? (
              <span>Input will be normalized on save.</span>
            ) : null}
          </div>
          <div className="form-actions">
            <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}>
              {saving ? 'שומר...' : isEditing ? 'עדכן' : 'צור'}
            </button>
            <button type="button" className="btn btn-secondary" disabled={saving} onClick={startCreate}>
              חדש
            </button>
          </div>
          {error ? <p className="form-error">{error}</p> : null}
          {success ? <p className="form-success">{success}</p> : null}
        </div>

        <div className="card table-card">
          <h3>Existing Domain Mappings</h3>
          {loading ? <p>טוען...</p> : null}
          {!loading && rows.length === 0 ? <p>לא נמצאו דומיינים.</p> : null}
          {!loading && rows.length > 0 ? (
            <table className="domains-table">
              <thead>
                <tr>
                  <th>Hostname</th>
                  <th>Tenant ID</th>
                  <th>Enabled</th>
                  <th>Resolved Yard UID</th>
                  <th>Warnings</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const scope = scopes[row.tenantId];
                  const warnings: string[] = [];
                  if (!scope) warnings.push('Unable to verify tenant config.');
                  if (scope && !scope.hasConfig) warnings.push('tenantSiteConfigs missing.');
                  if (scope && scope.hasConfig && !scope.yardUid) warnings.push('dataScope.yardUid/yardId missing.');
                  if (!row.enabled) warnings.push('Disabled (will not resolve).');

                  return (
                    <tr key={row.hostname}>
                      <td>{row.hostname}</td>
                      <td>{row.tenantId}</td>
                      <td>{row.enabled ? 'Yes' : 'No'}</td>
                      <td>{scope?.yardUid || '—'}</td>
                      <td>{warnings.length > 0 ? warnings.join(' ') : '—'}</td>
                      <td className="row-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => startEdit(row)}>
                          Edit
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => toggleEnabled(row)} disabled={saving}>
                          {row.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button type="button" className="btn btn-secondary btn-sm danger" onClick={() => onDelete(row)} disabled={saving}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}
        </div>
      </div>
    </div>
  );
}
