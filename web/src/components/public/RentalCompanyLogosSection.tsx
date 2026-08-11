import PartnerAdsStrip from './PartnerAdsStrip';

/**
 * RentalCompanyLogosSection - Wrapper for backward compatibility
 * Now uses PartnerAdsStrip with HOME_TOP_STRIP placement
 */
export default function RentalCompanyLogosSection() {
  return (
    <section className="rental-companies-section" aria-labelledby="rental-companies-heading">
      <h2 id="rental-companies-heading" className="rental-companies-heading">
        חברות השכרה מובילות
      </h2>
      <PartnerAdsStrip placement="HOME_TOP_STRIP" />
    </section>
  );
}
