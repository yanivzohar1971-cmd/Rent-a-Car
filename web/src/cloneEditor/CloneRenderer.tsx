import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { db, doc, getDoc, serverTimestamp, setDoc } from "../firebase/firebaseClient";

type CloneRendererProps = {
  html?: string;
};

function sanitizeForRender(html: string): string {
  if (!html) return "";
  let out = html;
  out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  out = out.replace(/\son\w+\s*=\s*(['"]).*?\1/gi, "");
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, "");
  if (!/<meta\b[^>]*charset\s*=|<meta\b[^>]*http-equiv\s*=\s*["']?\s*content-type/i.test(out)) {
    out = `<meta charset="UTF-8">${out}`;
  }
  return out;
}

type ClonePage = { path: string; html: string };

function normalizeClonePath(path: string): string {
  const trimmed = (path || "").trim();
  if (!trimmed || trimmed === "/") return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withSlash.length > 1 ? withSlash.replace(/\/+$/, "") : withSlash;
}

export default function CloneRenderer({ html }: CloneRendererProps) {
  const { tenantId } = useParams<{ tenantId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingImageRef = useRef<HTMLImageElement | null>(null);
  const [pages, setPages] = useState<ClonePage[]>([]);
  const [editMode, setEditMode] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [inlineHtml, setInlineHtml] = useState(html ?? "");
  const [selectedLink, setSelectedLink] = useState<HTMLAnchorElement | null>(null);
  const [linkHrefInput, setLinkHrefInput] = useState("");
  const [linkInternalInput, setLinkInternalInput] = useState(false);

  useEffect(() => {
    setInlineHtml(html ?? "");
  }, [html]);

  useEffect(() => {
    if (!tenantId || html) return;
    const run = async () => {
      const ref = doc(db, "tenantSiteClones", tenantId);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setPages([]);
        return;
      }
      const raw = snap.data() as Record<string, unknown>;
      const rawPages = Array.isArray(raw.pages) ? raw.pages : [];
      const parsed: ClonePage[] = rawPages
        .map((p) => {
          const rec = p as Record<string, unknown>;
          const path = typeof rec.path === "string" ? normalizeClonePath(rec.path) : "";
          const pageHtml = typeof rec.html === "string" ? rec.html : "";
          if (!path || !pageHtml) return null;
          return { path, html: pageHtml };
        })
        .filter(Boolean) as ClonePage[];
      setPages(parsed);
    };
    void run();
  }, [tenantId, html]);

  const clonePath = useMemo(() => {
    if (!tenantId) return "/";
    const prefix = `/tenant/${tenantId}/clone`;
    if (!location.pathname.startsWith(prefix)) return "/";
    return normalizeClonePath(location.pathname.slice(prefix.length) || "/");
  }, [location.pathname, tenantId]);

  const htmlForPath = useMemo(() => {
    if (html !== undefined) return inlineHtml;
    const exact = pages.find((p) => normalizeClonePath(p.path) === clonePath);
    if (exact) return exact.html;
    const home = pages.find((p) => normalizeClonePath(p.path) === "/");
    return home?.html ?? "";
  }, [html, inlineHtml, pages, clonePath]);

  const safeHtml = useMemo(() => sanitizeForRender(htmlForPath), [htmlForPath]);

  const saveCurrentHtml = useCallback(
    async (updatedHtml: string) => {
      if (!tenantId) return;
      const normalizedPath = normalizeClonePath(clonePath);
      const nextPages = pages.map((p) =>
        normalizeClonePath(p.path) === normalizedPath ? { ...p, html: updatedHtml } : p,
      );
      const hasCurrentPath = nextPages.some((p) => normalizeClonePath(p.path) === normalizedPath);
      if (!hasCurrentPath) {
        nextPages.push({ path: normalizedPath, html: updatedHtml });
      }
      setPages(nextPages);
      if (html !== undefined) {
        setInlineHtml(updatedHtml);
      }
      setIsSaving(true);
      try {
        await setDoc(
          doc(db, "tenantSiteClones", tenantId),
          {
            pages: nextPages,
            html: updatedHtml,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } finally {
        setIsSaving(false);
      }
    },
    [tenantId, clonePath, pages],
  );

  const serializeAndSave = useCallback(async () => {
    const el = contentRef.current;
    if (!el) return;
    await saveCurrentHtml(el.innerHTML);
  }, [saveCurrentHtml]);

  const markEditableNodes = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;
    root.querySelectorAll("h1,h2,h3,p,span,li").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (!el.dataset.edit) el.dataset.edit = "text";
    });
    root.querySelectorAll("img").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      el.dataset.edit = "image";
    });
    root.querySelectorAll("a").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      el.dataset.edit = "link";
    });
  }, []);

  useEffect(() => {
    markEditableNodes();
  }, [safeHtml, markEditableNodes]);

  useEffect(() => {
    // DOM was re-rendered, old element references are stale.
    setSelectedLink(null);
  }, [safeHtml, clonePath]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      if (editMode) {
        const image = target.closest("img[data-edit='image']") as HTMLImageElement | null;
        if (image) {
          event.preventDefault();
          pendingImageRef.current = image;
          fileInputRef.current?.click();
          return;
        }

        const anchor = target.closest("a[data-edit='link']") as HTMLAnchorElement | null;
        if (anchor) {
          event.preventDefault();
          setSelectedLink(anchor);
          setLinkHrefInput(anchor.getAttribute("href") ?? "");
          setLinkInternalInput(anchor.getAttribute("data-clone-link") === "true");
          return;
        }

        const textEl = target.closest("h1[data-edit='text'],h2[data-edit='text'],h3[data-edit='text'],p[data-edit='text'],span[data-edit='text'],li[data-edit='text']") as HTMLElement | null;
        if (textEl && !textEl.isContentEditable) {
          event.preventDefault();
          textEl.contentEditable = "true";
          textEl.focus();
          const range = document.createRange();
          range.selectNodeContents(textEl);
          range.collapse(false);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
          return;
        }
      }

      const cloneAnchor = target.closest("a[data-clone-link='true']") as HTMLAnchorElement | null;
      if (!cloneAnchor) return;
      const href = cloneAnchor.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      navigate(href);
    };

    const onFocusOut = (event: FocusEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!target.matches("h1[data-edit='text'],h2[data-edit='text'],h3[data-edit='text'],p[data-edit='text'],span[data-edit='text'],li[data-edit='text']")) {
        return;
      }
      if (!target.isContentEditable) return;
      target.contentEditable = "false";
      void serializeAndSave();
    };

    host.addEventListener("click", onClick);
    host.addEventListener("focusout", onFocusOut);
    return () => {
      host.removeEventListener("click", onClick);
      host.removeEventListener("focusout", onFocusOut);
    };
  }, [navigate, safeHtml, editMode, serializeAndSave, tenantId]);

  const onImagePick: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    const img = pendingImageRef.current;
    pendingImageRef.current = null;
    event.target.value = "";
    if (!file || !img) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) return;
      img.setAttribute("src", result);
      await serializeAndSave();
    };
    reader.readAsDataURL(file);
  };

  const onSaveLink = async () => {
    if (!selectedLink) return;
    const trimmedHref = linkHrefInput.trim();
    selectedLink.setAttribute("href", trimmedHref);
    selectedLink.setAttribute("data-original-href", trimmedHref);
    if (linkInternalInput) {
      selectedLink.setAttribute("data-clone-link", "true");
    } else {
      selectedLink.removeAttribute("data-clone-link");
    }
    await serializeAndSave();
    setSelectedLink(null);
  };

  const onCancelLink = () => {
    setSelectedLink(null);
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button type="button" onClick={() => setEditMode((v) => !v)}>
          {editMode ? "Switch to Preview" : "Switch to Edit"}
        </button>
        <span style={{ color: "#6b7280", fontSize: 13 }}>{isSaving ? "Saving..." : "Saved"}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: selectedLink ? "1fr 320px" : "1fr", gap: 12, alignItems: "start" }}>
        <div
          ref={hostRef}
          style={{
            width: "100%",
            minHeight: "80vh",
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            background: "#fff",
            padding: 12,
            overflow: "auto",
          }}
        >
          <div ref={contentRef} dangerouslySetInnerHTML={{ __html: safeHtml }} />
        </div>

        {selectedLink && editMode && (
          <aside
            style={{
              position: "sticky",
              top: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              background: "#ffffff",
              padding: 12,
              display: "grid",
              gap: 10,
            }}
          >
            <div style={{ fontWeight: 600 }}>Edit Link</div>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={{ fontSize: 13, color: "#6b7280" }}>Href</span>
              <input
                type="text"
                value={linkHrefInput}
                onChange={(e) => setLinkHrefInput(e.target.value)}
                placeholder="/tenant/abc/clone/about or https://..."
                style={{ padding: "8px 10px" }}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={linkInternalInput}
                onChange={(e) => setLinkInternalInput(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>Internal clone link</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => void onSaveLink()}>
                Save
              </button>
              <button type="button" onClick={onCancelLink}>
                Cancel
              </button>
            </div>
          </aside>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={onImagePick} />
    </div>
  );
}
