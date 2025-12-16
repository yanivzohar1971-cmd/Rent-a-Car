import { Link } from 'react-router-dom';
import SeoHead from '../components/seo/SeoHead';
import seoLandingPagesData from '../assets/seoLandingPages.he.json';
import './SeoTopicsIndexPage.css';

interface SeoLandingPage {
  slug: string;
  path: string;
  title: string;
  description: string;
  h1: string;
  primaryKeywords: string[];
}

export default function SeoTopicsIndexPage() {
  const pages = seoLandingPagesData as SeoLandingPage[];

  // Group pages by category
  const salesPages = pages.filter((p) => 
    p.path.startsWith('/cars-for-sale') || 
    p.path.startsWith('/yards') ||
    p.path.startsWith('/dealers') ||
    p.path.startsWith('/agencies')
  );

  const rentalPages = pages.filter((p) => 
    p.path.startsWith('/rent')
  );

  const guidePages = pages.filter((p) => 
    p.path.startsWith('/guides')
  );

  const locationPages = pages.filter((p) => 
    (p.path.startsWith('/yards/') && p.path !== '/yards') ||
    (p.path.startsWith('/rent/') && p.path !== '/rent')
  );

  const baseUrl = 'https://www.carexperts4u.com';
  const canonicalUrl = `${baseUrl}/topics`;

  return (
    <>
      <SeoHead
        title="מדריכים ועמודי מידע | CarExpert"
        description="מדריכים מקיפים על רכבים, קנייה, מכירה, השכרה, בדיקות, ומגרשי רכב. כל המידע שאתם צריכים במקום אחד."
        canonicalUrl={canonicalUrl}
        ogTitle="מדריכים ועמודי מידע | CarExpert"
        ogDescription="מדריכים מקיפים על רכבים, קנייה, מכירה, השכרה, בדיקות, ומגרשי רכב."
        ogUrl={canonicalUrl}
      />
      <div className="seo-topics-page" dir="rtl">
        <div className="seo-topics-container">
          <header className="seo-topics-header">
            <h1 className="seo-topics-h1">מדריכים ועמודי מידע</h1>
            <p className="seo-topics-intro">
              כאן תמצאו מדריכים מקיפים על רכבים, קנייה, מכירה, השכרה, בדיקות, מגרשי רכב ועוד. 
              כל המידע שאתם צריכים במקום אחד.
            </p>
          </header>

          <div className="seo-topics-sections">
            <section className="seo-topics-section">
              <h2 className="seo-topics-section-title">רכבים למכירה וקנייה</h2>
              <div className="seo-topics-grid">
                {salesPages.map((page) => (
                  <Link key={page.slug} to={page.path} className="seo-topics-card">
                    <h3 className="seo-topics-card-title">{page.h1}</h3>
                    <p className="seo-topics-card-description">{page.description}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="seo-topics-section">
              <h2 className="seo-topics-section-title">השכרת רכב</h2>
              <div className="seo-topics-grid">
                {rentalPages.map((page) => (
                  <Link key={page.slug} to={page.path} className="seo-topics-card">
                    <h3 className="seo-topics-card-title">{page.h1}</h3>
                    <p className="seo-topics-card-description">{page.description}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="seo-topics-section">
              <h2 className="seo-topics-section-title">מדריכים ובדיקות</h2>
              <div className="seo-topics-grid">
                {guidePages.map((page) => (
                  <Link key={page.slug} to={page.path} className="seo-topics-card">
                    <h3 className="seo-topics-card-title">{page.h1}</h3>
                    <p className="seo-topics-card-description">{page.description}</p>
                  </Link>
                ))}
              </div>
            </section>

            <section className="seo-topics-section">
              <h2 className="seo-topics-section-title">מיקומים</h2>
              <div className="seo-topics-grid">
                {locationPages.map((page) => (
                  <Link key={page.slug} to={page.path} className="seo-topics-card">
                    <h3 className="seo-topics-card-title">{page.h1}</h3>
                    <p className="seo-topics-card-description">{page.description}</p>
                  </Link>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
