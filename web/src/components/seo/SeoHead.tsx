import { useEffect } from 'react';

interface SeoHeadProps {
  title: string;
  description: string;
  canonicalUrl?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogUrl?: string;
  ogImage?: string;
  ogType?: string;
  noindex?: boolean;
  nofollow?: boolean;
  twitterCard?: 'summary' | 'summary_large_image';
  twitterTitle?: string;
  twitterDescription?: string;
  twitterImage?: string;
}

/**
 * SeoHead component for managing SEO meta tags
 * Supports: title, description, canonical, Open Graph, Twitter Cards, noindex/nofollow
 */
export default function SeoHead({
  title,
  description,
  canonicalUrl,
  ogTitle,
  ogDescription,
  ogUrl,
  ogImage,
  ogType = 'website',
  noindex = false,
  nofollow = false,
  twitterCard,
  twitterTitle,
  twitterDescription,
  twitterImage,
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

    // Set or update robots meta (noindex/nofollow)
    let robotsMeta = document.querySelector('meta[name="robots"]');
    if (noindex || nofollow) {
      if (!robotsMeta) {
        robotsMeta = document.createElement('meta');
        robotsMeta.setAttribute('name', 'robots');
        document.head.appendChild(robotsMeta);
      }
      const directives: string[] = [];
      if (noindex) directives.push('noindex');
      if (nofollow) directives.push('nofollow');
      if (directives.length === 0) {
        directives.push('index', 'follow'); // Default if neither is true
      }
      robotsMeta.setAttribute('content', directives.join(', '));
    } else if (robotsMeta) {
      // Remove robots meta if noindex/nofollow are false
      robotsMeta.remove();
    }

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

    // og:type
    let ogTypeTag = document.querySelector('meta[property="og:type"]');
    if (!ogTypeTag) {
      ogTypeTag = document.createElement('meta');
      ogTypeTag.setAttribute('property', 'og:type');
      document.head.appendChild(ogTypeTag);
    }
    ogTypeTag.setAttribute('content', ogType);

    // og:url
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

    // og:image
    if (ogImage) {
      let ogImageTag = document.querySelector('meta[property="og:image"]');
      if (!ogImageTag) {
        ogImageTag = document.createElement('meta');
        ogImageTag.setAttribute('property', 'og:image');
        document.head.appendChild(ogImageTag);
      }
      ogImageTag.setAttribute('content', ogImage);
    }

    // Twitter Card tags
    if (twitterCard) {
      let twitterCardTag = document.querySelector('meta[name="twitter:card"]');
      if (!twitterCardTag) {
        twitterCardTag = document.createElement('meta');
        twitterCardTag.setAttribute('name', 'twitter:card');
        document.head.appendChild(twitterCardTag);
      }
      twitterCardTag.setAttribute('content', twitterCard);

      const twTitle = twitterTitle || ogTitleValue || title;
      let twTitleTag = document.querySelector('meta[name="twitter:title"]');
      if (!twTitleTag) {
        twTitleTag = document.createElement('meta');
        twTitleTag.setAttribute('name', 'twitter:title');
        document.head.appendChild(twTitleTag);
      }
      twTitleTag.setAttribute('content', twTitle);

      const twDesc = twitterDescription || ogDescValue || description;
      let twDescTag = document.querySelector('meta[name="twitter:description"]');
      if (!twDescTag) {
        twDescTag = document.createElement('meta');
        twDescTag.setAttribute('name', 'twitter:description');
        document.head.appendChild(twDescTag);
      }
      twDescTag.setAttribute('content', twDesc);

      const twImage = twitterImage || ogImage;
      if (twImage) {
        let twImageTag = document.querySelector('meta[name="twitter:image"]');
        if (!twImageTag) {
          twImageTag = document.createElement('meta');
          twImageTag.setAttribute('name', 'twitter:image');
          document.head.appendChild(twImageTag);
        }
        twImageTag.setAttribute('content', twImage);
      }
    }
  }, [
    title,
    description,
    canonicalUrl,
    ogTitle,
    ogDescription,
    ogUrl,
    ogImage,
    ogType,
    noindex,
    nofollow,
    twitterCard,
    twitterTitle,
    twitterDescription,
    twitterImage,
  ]);

  return null;
}
