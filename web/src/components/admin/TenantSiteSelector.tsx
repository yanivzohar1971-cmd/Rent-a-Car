import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchAllYardsForAdmin, type AdminYardSummary } from '../../api/adminYardsApi';

export type BuilderScope = {
  selectedYardId: string;
  yardUid: string;
  legacyTenantId: string;
  usingLegacyTenantFallback: boolean;
};

export function resolveBuilderScopeFromSelectedYard(
  selectedYardIdInput: string,
  legacyTenantIdInput: string,
): BuilderScope | null {
  const selectedYardId = selectedYardIdInput.trim();
  if (selectedYardId) {
    return {
      selectedYardId,
      yardUid: selectedYardId,
      legacyTenantId: selectedYardId,
      usingLegacyTenantFallback: false,
    };
  }
  const legacyTenantId = legacyTenantIdInput.trim();
  if (!legacyTenantId) return null;
  return {
    selectedYardId: '',
    yardUid: '',
    legacyTenantId,
    usingLegacyTenantFallback: true,
  };
}

export function sortAdminYardsForSiteBuilder(rows: AdminYardSummary[]): AdminYardSummary[] {
  return [...rows].sort((a, b) => {
    const an = (a.name || '').trim().toLocaleLowerCase('he');
    const bn = (b.name || '').trim().toLocaleLowerCase('he');
    if (an === bn) return a.id.localeCompare(b.id);
    return an.localeCompare(bn, 'he');
  });
}

const YARDS_FETCH_ERROR_HE = 'טעינת רשימת המגרשים נכשלה.';

export interface UseTenantSiteYardPickerOptions {
  enabled?: boolean;
  onYardsFetchError?: (message: string) => void;
}

export function useTenantSiteYardPicker(options: UseTenantSiteYardPickerOptions = {}) {
  const { enabled = true, onYardsFetchError } = options;

  const [yards, setYards] = useState<AdminYardSummary[]>([]);
  const [yardsLoading, setYardsLoading] = useState(false);
  const [yardsError, setYardsError] = useState<string | null>(null);
  const [yardSearch, setYardSearch] = useState('');
  const [selectedYardId, setSelectedYardId] = useState('');
  const [legacyTenantIdInput, setLegacyTenantIdInput] = useState('');

  const onYardsFetchErrorCb = useCallback(
    (msg: string) => {
      onYardsFetchError?.(msg);
    },
    [onYardsFetchError],
  );

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setYardsLoading(true);
    setYardsError(null);
    fetchAllYardsForAdmin()
      .then((rows) => {
        if (cancelled) return;
        setYards(sortAdminYardsForSiteBuilder(rows));
      })
      .catch(() => {
        if (cancelled) return;
        const msg = YARDS_FETCH_ERROR_HE;
        onYardsFetchErrorCb(msg);
        setYardsError(msg);
        setYards([]);
      })
      .finally(() => {
        if (cancelled) return;
        setYardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, onYardsFetchErrorCb]);

  const filteredYards = useMemo(() => {
    const q = yardSearch.trim().toLocaleLowerCase('he');
    if (!q) return yards;
    return yards.filter((y) => {
      const name = (y.name || '').toLocaleLowerCase('he');
      const id = y.id.toLocaleLowerCase('he');
      return name.includes(q) || id.includes(q);
    });
  }, [yards, yardSearch]);

  const builderScope = useMemo(
    () => resolveBuilderScopeFromSelectedYard(selectedYardId, legacyTenantIdInput),
    [selectedYardId, legacyTenantIdInput],
  );

  const activeLegacyTenantId = builderScope?.legacyTenantId ?? '';

  const selectedYard = useMemo(
    () => yards.find((y) => y.id === selectedYardId) ?? null,
    [yards, selectedYardId],
  );

  const yardSelected = selectedYardId.trim().length > 0;

  return {
    yards,
    yardsLoading,
    yardsError,
    yardSearch,
    setYardSearch,
    selectedYardId,
    setSelectedYardId,
    legacyTenantIdInput,
    setLegacyTenantIdInput,
    filteredYards,
    builderScope,
    activeLegacyTenantId,
    selectedYard,
    yardSelected,
  };
}

export type TenantSiteYardPickerApi = ReturnType<typeof useTenantSiteYardPicker>;

export interface TenantSiteYardPickerFieldsProps {
  picker: TenantSiteYardPickerApi;
  onSelectYard: (yardId: string) => void;
  /** Defaults to Website Builder hint when omitted; pass null to hide. */
  emptyYardHint?: ReactNode;
}

export function TenantSiteYardPickerFields({
  picker,
  onSelectYard,
  emptyYardHint,
}: TenantSiteYardPickerFieldsProps) {
  const {
    yardsLoading,
    yardsError,
    yards,
    filteredYards,
    selectedYardId,
    yardSearch,
    setYardSearch,
    legacyTenantIdInput,
    setLegacyTenantIdInput,
    selectedYard,
    builderScope,
  } = picker;

  return (
    <>
      <div className="builder-yard-picker">
        <label className="field-label">
          רשימת מגרשים
          <select
            value={selectedYardId}
            onChange={(e) => onSelectYard(e.target.value)}
            disabled={yardsLoading || !!yardsError}
            aria-busy={yardsLoading}
          >
            <option value="">{yardsLoading ? 'טוען מגרשים…' : 'בחר מגרש'}</option>
            {filteredYards.map((yard) => (
              <option key={yard.id} value={yard.id}>
                {yard.name} ({yard.id})
              </option>
            ))}
          </select>
        </label>
        <div className="builder-yard-picker-status" aria-live="polite">
          {yardsLoading ? <span>טוען רשימת מגרשים…</span> : null}
          {!yardsLoading && yardsError ? <span className="form-error">{yardsError}</span> : null}
          {!yardsLoading && !yardsError && yards.length === 0 ? <span>לא נמצאו מגרשים.</span> : null}
          {!yardsLoading && !yardsError && yards.length > 0 && filteredYards.length === 0 ? (
            <span>לא נמצאו תוצאות לחיפוש.</span>
          ) : null}
          {selectedYard ? (
            <span>
              נבחר: <strong>{selectedYard.name}</strong> <code dir="ltr">{selectedYard.id}</code>
            </span>
          ) : null}
          {builderScope?.usingLegacyTenantFallback ? (
            <span className="builder-legacy-pill">מצב תאימות: tenantId ידני</span>
          ) : null}
        </div>
        {!picker.yardSelected && emptyYardHint !== null ? (
          <p className="hint" style={{ margin: 0 }}>
            {emptyYardHint ?? 'בחר מגרש כדי להתחיל לערוך את אתר הלקוח'}
          </p>
        ) : null}
      </div>
      <details className="builder-advanced-scope">
        <summary>אפשרויות מתקדמות (תאימות legacy)</summary>
        <label className="field-label">
          סינון מגרשים (Advanced)
          <input
            type="search"
            value={yardSearch}
            onChange={(e) => setYardSearch(e.target.value)}
            placeholder="חיפוש לפי שם/UID"
            dir="ltr"
          />
        </label>
        <label className="field-label">
          tenantId תאימות (לשימוש חריג בלבד)
          <input
            type="text"
            value={legacyTenantIdInput}
            onChange={(e) => setLegacyTenantIdInput(e.target.value)}
            placeholder="יופעל רק אם לא נבחר מגרש"
            dir="ltr"
          />
        </label>
        <p className="hint">במצב תקין יש לבחור מגרש בלבד. שדה זה נשמר לצורכי תאימות לאחור.</p>
      </details>
    </>
  );
}
