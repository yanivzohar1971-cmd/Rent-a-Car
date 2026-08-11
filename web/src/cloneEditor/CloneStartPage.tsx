import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  TenantSiteYardPickerFields,
  useTenantSiteYardPicker,
} from "../components/admin/TenantSiteSelector";
import "../pages/AdminTenantSiteBuilderPage.css";

function isValidHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export default function CloneStartPage() {
  const navigate = useNavigate();
  const { userProfile, loading: authLoading } = useAuth();
  const isAdmin = userProfile?.isAdmin === true;

  const yardPicker = useTenantSiteYardPicker({
    enabled: !authLoading && isAdmin,
  });

  const { activeLegacyTenantId, yardsLoading, setSelectedYardId } = yardPicker;

  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canContinue =
    activeLegacyTenantId.trim().length > 0 && isValidHttpUrl(sourceUrl);

  const onContinue = () => {
    if (!canContinue) {
      setError("יש לבחור מגרש (או tenantId תאימות) ולהזין URL תקין (http:// או https://).");
      return;
    }
    const tenantId = activeLegacyTenantId.trim();
    const path = `/admin/tenant/${encodeURIComponent(tenantId)}/clone-editor`;
    const qs = new URLSearchParams({ url: sourceUrl.trim() }).toString();
    navigate(`${path}?${qs}`);
  };

  return (
    <div className="admin-tenant-site-builder-page">
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <h1 style={{ margin: "0 0 8px" }}>Clone Website (WYSIWYG)</h1>
        <p className="muted intro" style={{ marginTop: 0 }}>
          בחר מגרש והזן URL מקור לפני מעבר לעורך — אותה רשימת מגרשים כמו ב־Website Builder.
        </p>

        <div className="builder-toolbar-card">
          <TenantSiteYardPickerFields
            picker={yardPicker}
            onSelectYard={setSelectedYardId}
            emptyYardHint="בחר מגרש והזן את כתובת האתר המקורית להמשך"
          />

          <label className="field-label" style={{ marginTop: 12 }}>
            Source Website URL
            <input
              type="url"
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
              placeholder="https://example.com"
              dir="ltr"
              style={{ maxWidth: "100%" }}
            />
          </label>

          {error ? (
            <div
              style={{
                color: "#b91c1c",
                background: "#fef2f2",
                padding: "8px 10px",
                borderRadius: 6,
                marginTop: 12,
              }}
            >
              {error}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button type="button" onClick={onContinue} disabled={!canContinue || yardsLoading}>
              Continue to Clone Editor
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
