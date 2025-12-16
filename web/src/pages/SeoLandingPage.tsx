import { useEffect, useState } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import seoLandingPagesData from '../assets/seoLandingPages.he.json';
import './SeoLandingPage.css';

interface SeoLandingPage {
  slug: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  primaryKeywords: string[];
  sections: Array<{
    h2: string;
    body: string[];
  }>;
  faq: Array<{
    q: string;
    a: string;
  }>;
  internalLinks: Array<{
    label: string;
    to: string;
  }>;
}

export default function SeoLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const pages = seoLandingPagesData as SeoLandingPage[];

  // Find page by exact path match first, then by slug
  const page = pages.find(
    (p) => location.pathname === p.path
  ) || pages.find(
    (p) => p.slug === slug
  ) || pages.find(
    (p) => location.pathname.startsWith(p.path + '/') || location.pathname === p.path
  );

  useEffect(() => {
    if (!page) {
      document.title = 'עמוד לא נמצא | CarExpert';
    }
  }, [page]);

  if (!page) {
    return (
      <div className="seo-landing-page" dir="rtl">
        <div className="seo-landing-container">
          <div className="seo-landing-not-found">
            <h1>עמוד לא נמצא</h1>
            <p>העמוד שביקשתם לא נמצא.</p>
            <Link to="/topics" className="btn btn-primary">
              חזרה לעמודי מידע
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const baseUrl = 'https://www.carexperts4u.com';
  const canonicalUrl = `${baseUrl}${page.path}`;

  return (
    <>
      <SeoHead
        title={page.title}
        description={page.description}
        canonicalUrl={canonicalUrl}
        ogTitle={page.title}
        ogDescription={page.description}
        ogUrl={canonicalUrl}
      />
      <div className="seo-landing-page" dir="rtl">
        <div className="seo-landing-container">
          <nav className="seo-landing-breadcrumb" aria-label="ניווט">
            <Link to="/">דף הבית</Link>
            <span className="breadcrumb-separator">›</span>
            <Link to="/topics">מדריכים ועמודי מידע</Link>
            <span className="breadcrumb-separator">›</span>
            <span className="breadcrumb-current">{page.h1}</span>
          </nav>

          <article className="seo-landing-article">
            <header className="seo-landing-header">
              <h1 className="seo-landing-h1">{page.h1}</h1>
              <p className="seo-landing-last-updated">
                עודכן לאחרונה: {new Date().toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </header>

            <div className="seo-landing-intro">
              <p className="seo-landing-intro-text">
                {page.sections[0]?.body.join(' ') || 'מידע מקצועי על רכבים, קנייה, מכירה והשכרה.'}
              </p>
            </div>

            <div className="seo-landing-content">
              {page.sections.slice(1).map((section, idx) => (
                <section key={idx} className="seo-landing-section">
                  <h2 className="seo-landing-section-title">{section.h2}</h2>
                  {section.body.map((paragraph, pIdx) => (
                    <p key={pIdx} className="seo-landing-section-body">
                      {paragraph}
                    </p>
                  ))}
                </section>
              ))}
            </div>

            {page.faq && page.faq.length > 0 && (
              <div className="seo-landing-faq">
              <h2 className="seo-landing-faq-title">שאלות נפוצות</h2>
              {page.faq.map((item, idx) => (
                <details
                  key={idx}
                  className="seo-landing-faq-item"
                  open={expandedFaq === idx}
                  onToggle={(e) => {
                    setExpandedFaq(e.currentTarget.open ? idx : null);
                  }}
                >
                  <summary className="seo-landing-faq-question">{item.q}</summary>
                  <div className="seo-landing-faq-answer">{item.a}</div>
                </details>
              ))}
            </div>
            )}

            <div className="seo-landing-cta">
              <h3 className="seo-landing-cta-title">מוכנים לפעולה?</h3>
              <div className="seo-landing-cta-buttons">
                {page.internalLinks.map((link, idx) => (
                  <Link key={idx} to={link.to} className="btn btn-primary btn-large">
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </article>
        </div>
      </div>
    </>
  );
}
