import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { fetchRentalCompanyBySlug, type RentalCompany, type OutboundPolicy } from '../api/rentalCompaniesApi';
import './PartnerLandingPage.css';

/**
 * Get rel attribute based on outbound policy
 */
function getRelAttribute(outboundPolicy?: OutboundPolicy): string {
  switch (outboundPolicy) {
    case 'SPONSORED_NOFOLLOW':
      return 'sponsored nofollow noopener noreferrer';
    case 'NOFOLLOW':
      return 'nofollow noopener noreferrer';
    case 'FOLLOW':
      return 'noopener noreferrer';
    default:
      return 'sponsored nofollow noopener noreferrer';
  }
}

export default function PartnerLandingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [partner, setPartner] = useState<RentalCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) {
      setError('שגיאה: לא נמצא מזהה שותף');
      setLoading(false);
      return;
    }

    async function loadPartner() {
      try {
        setLoading(true);
        setError(null);
        const partnerData = await fetchRentalCompanyBySlug(slug!);
        if (!partnerData) {
          setError('שותף לא נמצא');
        } else {
          setPartner(partnerData);
        }
      } catch (err: any) {
        console.error('Error loading partner:', err);
        setError('אירעה שגיאה בטעינת עמוד השותף');
      } finally {
        setLoading(false);
      }
    }

    loadPartner();
  }, [slug]);

  if (loading) {
    return (
      <div className="partner-landing-page">
        <div className="page-container">
          <div className="loading-state">
            <p>טוען...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !partner) {
    return (
      <div className="partner-landing-page">
        <div className="page-container">
          <div className="error-state">
            <h1>שותף לא נמצא</h1>
            <p>{error || 'העמוד המבוקש לא נמצא במערכת.'}</p>
            <Link to="/" className="btn btn-primary">
              חזור לעמוד הבית
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="partner-landing-page">
      <div className="page-container">
        <article className="partner-content">
          {partner.logoUrl && (
            <div className="partner-logo-container">
              <img
                src={partner.logoUrl + (typeof partner.logoVersion === 'number' && isFinite(partner.logoVersion) ? `?v=${partner.logoVersion}` : '')}
                alt={partner.logoAlt || `לוגו ${partner.nameHe}`}
                className="partner-logo"
              />
            </div>
          )}

          <h1 className="partner-title">
            {partner.headlineHe || partner.nameHe}
          </h1>

          {partner.descriptionHe && (
            <div className="partner-description">
              <p>{partner.descriptionHe}</p>
            </div>
          )}

          {partner.websiteUrl && (
            <div className="partner-cta">
              <a
                href={partner.websiteUrl}
                target="_blank"
                rel={getRelAttribute(partner.outboundPolicy)}
                className="btn btn-primary btn-large"
              >
                לאתר החברה
              </a>
            </div>
          )}

          <div className="partner-meta">
            <p className="partner-name">
              <strong>שם החברה:</strong> {partner.nameHe}
            </p>
            {partner.nameEn && (
              <p className="partner-name-en">
                <strong>Company Name:</strong> {partner.nameEn}
              </p>
            )}
          </div>
        </article>
      </div>
    </div>
  );
}
