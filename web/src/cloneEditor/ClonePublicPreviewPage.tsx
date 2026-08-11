import { useMemo } from "react";
import { useParams } from "react-router-dom";
import CloneRenderer from "./CloneRenderer";
import { useCloneTemplate } from "./useCloneTemplate";

export default function ClonePublicPreviewPage() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { cloneData, loading, error } = useCloneTemplate(tenantId);

  const hasPreviewHtml = useMemo(
    () =>
      Boolean(
        (cloneData?.selfContainedDocumentHtml && cloneData.selfContainedDocumentHtml.trim()) ||
          (cloneData?.documentHtml && cloneData.documentHtml.trim()),
      ),
    [cloneData?.selfContainedDocumentHtml, cloneData?.documentHtml],
  );

  if (!tenantId) {
    return <div style={{ padding: 16, color: "#991b1b" }}>Missing tenant id.</div>;
  }
  if (loading) {
    return <div style={{ padding: 16, color: "#4b5563" }}>Loading public preview...</div>;
  }
  if (error) {
    return <div style={{ padding: 16, color: "#991b1b" }}>{error}</div>;
  }
  if (!cloneData?.cloneDocExists || !hasPreviewHtml) {
    return <div style={{ padding: 16, color: "#6b7280" }}>No public clone preview available yet.</div>;
  }

  return (
    <div style={{ padding: 12 }}>
      <CloneRenderer
        html={cloneData.html}
        documentHtml={cloneData.documentHtml}
        selfContainedDocumentHtml={cloneData.selfContainedDocumentHtml}
        cssText={cloneData.cssText}
        styles={cloneData.styles}
      />
    </div>
  );
}
