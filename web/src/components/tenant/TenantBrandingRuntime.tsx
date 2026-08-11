import { useEffect, useRef } from 'react';
import { BRAND_NAME } from '../../config/branding';
import { useTenantSiteConfig } from '../../hooks/useTenantSiteConfig';

function applyTenantTitleBranding(tenantDisplayName: string): void {
  const currentTitle = document.title || '';
  const nextTitle = currentTitle.includes(BRAND_NAME)
    ? currentTitle.replaceAll(BRAND_NAME, tenantDisplayName)
    : currentTitle.trim()
      ? currentTitle
      : tenantDisplayName;

  if (nextTitle !== currentTitle) {
    document.title = nextTitle;
  }
}

function setMetaContent(attr: 'name' | 'property', key: string, content: string | null): void {
  if (typeof document === 'undefined') return;
  const selector = attr === 'name' ? `meta[name="${key}"]` : `meta[property="${key}"]`;
  let el = document.querySelector(selector) as HTMLMetaElement | null;
  if (content === null || content === '') {
    el?.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function TenantBrandingRuntime() {
  const { isTenantHost, branding, normalized } = useTenantSiteConfig();
  const lastOgImageRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTenantHost || typeof document === 'undefined') return;

    let observer: MutationObserver | null = null;
    const seoTitle = normalized.seo.title;
    const displayName = branding.displayName || branding.siteName;

    if (seoTitle) {
      document.title = seoTitle;
    } else if (displayName) {
      applyTenantTitleBranding(displayName);
      const titleElement = document.querySelector('title');
      if (titleElement) {
        observer = new MutationObserver(() => {
          applyTenantTitleBranding(displayName);
        });
        observer.observe(titleElement, {
          childList: true,
          characterData: true,
          subtree: true,
        });
      }
    }

    return () => {
      observer?.disconnect();
    };
  }, [isTenantHost, branding.displayName, normalized.seo.title, branding.siteName]);

  useEffect(() => {
    if (!isTenantHost || typeof document === 'undefined') return;
    if (normalized.seo.description) {
      setMetaContent('name', 'description', normalized.seo.description);
    }

    const og = normalized.seo.ogImageUrl;
    if (og) {
      setMetaContent('property', 'og:image', og);
      lastOgImageRef.current = og;
    }
  }, [isTenantHost, normalized.seo.description, normalized.seo.ogImageUrl]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (!isTenantHost) {
      if (lastOgImageRef.current) {
        const cur = document.querySelector('meta[property="og:image"]') as HTMLMetaElement | null;
        if (cur?.getAttribute('content') === lastOgImageRef.current) {
          cur.remove();
        }
        lastOgImageRef.current = null;
      }
      document.documentElement.removeAttribute('data-tenant-theme');
      return;
    }

    document.documentElement.setAttribute('data-tenant-theme', branding.themeVariant);

    const rootStyle = document.documentElement.style;

    if (branding.theme.primaryColor) rootStyle.setProperty('--tenant-primary-color', branding.theme.primaryColor);
    else rootStyle.removeProperty('--tenant-primary-color');

    if (branding.theme.secondaryColor) rootStyle.setProperty('--tenant-secondary-color', branding.theme.secondaryColor);
    else rootStyle.removeProperty('--tenant-secondary-color');

    if (branding.theme.accentColor) rootStyle.setProperty('--tenant-accent-color', branding.theme.accentColor);
    else rootStyle.removeProperty('--tenant-accent-color');

    if (branding.textColor) rootStyle.setProperty('--tenant-text-color', branding.textColor);
    else rootStyle.removeProperty('--tenant-text-color');

    if (branding.backgroundColor) rootStyle.setProperty('--tenant-background-color', branding.backgroundColor);
    else rootStyle.removeProperty('--tenant-background-color');

    return () => {
      document.documentElement.removeAttribute('data-tenant-theme');
      rootStyle.removeProperty('--tenant-primary-color');
      rootStyle.removeProperty('--tenant-secondary-color');
      rootStyle.removeProperty('--tenant-accent-color');
      rootStyle.removeProperty('--tenant-text-color');
      rootStyle.removeProperty('--tenant-background-color');
    };
  }, [
    isTenantHost,
    branding.theme.primaryColor,
    branding.theme.secondaryColor,
    branding.theme.accentColor,
    branding.textColor,
    branding.backgroundColor,
    branding.themeVariant,
  ]);

  return null;
}
