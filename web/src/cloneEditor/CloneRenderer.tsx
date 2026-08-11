import { useCallback, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";

type CloneRendererProps = {
  html?: string;
  documentHtml?: string;
  selfContainedDocumentHtml?: string;
  cssText?: string;
  styles?: string[];
  onInjectedCloneStyleTagChange?: (hasTag: boolean) => void;
  onInlineEditSaveStatusChange?: (status: "idle" | "saving" | "saved" | "disabled") => void;
};

function removeScripts(inputHtml: string): string {
  return inputHtml.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
}

function buildFallbackDocumentHtml(html: string, cssText: string, styles: string[]): string {
  const safeHtml = removeScripts(html ?? "");
  const safeCss = (cssText ?? "").replace(/<\/style/gi, "<\\/style");
  const links = styles
    .filter((href) => /^https?:\/\//i.test(href))
    .map((href) => `<link rel="stylesheet" href="${href}">`)
    .join("\n");
  return `<!doctype html>
<html>
<head>
<meta charset="UTF-8">
${links}
${safeCss.trim() ? `<style data-clone-styles="true">${safeCss}</style>` : ""}
</head>
<body>${safeHtml}</body>
</html>`;
}

function injectStylesheetLinks(documentHtml: string, styles: string[]): string {
  const linkTags = styles
    .filter((href) => /^https?:\/\//i.test(href))
    .map((href) => `<link rel="stylesheet" href="${href}" data-clone-link-style="true">`)
    .join("\n");
  if (!linkTags) return documentHtml;
  if (/<head\b[^>]*>/i.test(documentHtml)) {
    return documentHtml.replace(/<head\b[^>]*>/i, (m) => `${m}\n${linkTags}\n`);
  }
  return documentHtml.replace(/<html\b[^>]*>/i, (m) => `${m}\n<head>\n${linkTags}\n</head>\n`);
}

export default function CloneRenderer({
  html,
  documentHtml,
  selfContainedDocumentHtml,
  cssText,
  styles,
  onInjectedCloneStyleTagChange,
  onInlineEditSaveStatusChange,
}: CloneRendererProps) {
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeSrcDoc = useMemo(() => {
    const candidate = (selfContainedDocumentHtml ?? "").trim() || (documentHtml ?? "").trim();
    if (candidate) return removeScripts(injectStylesheetLinks(candidate, styles ?? []));
    return buildFallbackDocumentHtml(html ?? "", cssText ?? "", styles ?? []);
  }, [selfContainedDocumentHtml, documentHtml, html, cssText, styles]);

  useEffect(() => {
    onInlineEditSaveStatusChange?.("disabled");
  }, [onInlineEditSaveStatusChange]);

  useEffect(() => {
    onInjectedCloneStyleTagChange?.(
      /<style\b[^>]*data-clone-styles=['"]true['"]/i.test(iframeSrcDoc) ||
        /<link\b[^>]*data-clone-link-style=['"]true['"]/i.test(iframeSrcDoc),
    );
  }, [iframeSrcDoc, onInjectedCloneStyleTagChange]);

  const onIframeLoad = useCallback(() => {
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!doc) return;

    const hasStyleTag = Boolean(
      doc.querySelector("style[data-clone-styles='true'], link[data-clone-link-style='true']"),
    );
    onInjectedCloneStyleTagChange?.(hasStyleTag);

    const clickHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest("a[data-clone-link='true']") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      navigate(href);
    };
    doc.addEventListener("click", clickHandler);
  }, [navigate, onInjectedCloneStyleTagChange]);

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", color: "#6b7280", fontSize: 13 }}>
        Edit mode is temporarily disabled in iframe preview mode.
      </div>
      <iframe
        ref={iframeRef}
        title="Clone website preview"
        srcDoc={iframeSrcDoc}
        onLoad={onIframeLoad}
        sandbox="allow-same-origin allow-popups allow-forms"
        style={{
          width: "100%",
          minHeight: "80vh",
          border: "1px solid #e5e7eb",
          borderRadius: 8,
          background: "#fff",
        }}
      />
    </div>
  );
}
