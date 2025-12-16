import { useEffect } from 'react';

interface SeoHeadProps {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
}

export default function SeoHead({
  title,
  description,
  canonicalUrl,
  ogTitle,
  ogDescription,
  ogUrl,
}: SeoHeadProps) {
  useEffect(() => {
    // Set document title
    document.title = title;

    // Set or update meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute('content', description);

    // Set or update canonical link
    let canonical = document.querySelector('link[rel="canonical"]');
    if (canonicalUrl) {
      if (!canonical) {
        canonical = document.createElement('link');
        canonical.setAttribute('rel', 'canonical');
        document.head.appendChild(canonical);
      }
      canonical.setAttribute('href', canonicalUrl);
    } else if (canonical) {
      canonical.remove();
    }

    // Set or update Open Graph tags
    const ogTitleValue = ogTitle || title;
    let ogTitleTag = document.querySelector('meta[property="og:title"]');
    if (!ogTitleTag) {
      ogTitleTag = document.createElement('meta');
      ogTitleTag.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitleTag);
    }
    ogTitleTag.setAttribute('content', ogTitleValue);

    const ogDescValue = ogDescription || description;
    let ogDescTag = document.querySelector('meta[property="og:description"]');
    if (!ogDescTag) {
      ogDescTag = document.createElement('meta');
      ogDescTag.setAttribute('property', 'og:description');
      document.head.appendChild(ogDescTag);
    }
    ogDescTag.setAttribute('content', ogDescValue);

    if (ogUrl || canonicalUrl) {
      const ogUrlValue = ogUrl || canonicalUrl || window.location.href;
      let ogUrlTag = document.querySelector('meta[property="og:url"]');
      if (!ogUrlTag) {
        ogUrlTag = document.createElement('meta');
        ogUrlTag.setAttribute('property', 'og:url');
        document.head.appendChild(ogUrlTag);
      }
      ogUrlTag.setAttribute('content', ogUrlValue);
    }
  }, [title, description, canonicalUrl, ogTitle, ogDescription, ogUrl]);

  return null;
}
