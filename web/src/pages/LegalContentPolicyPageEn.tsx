import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function LegalContentPolicyPageEn() {
  // Hebrew route for this page
  const heRoute = '/legal/content-policy';

  return (
    <div className="legal-page" dir="ltr">
      <div className="legal-page-container" style={{ direction: 'ltr' }}>
        {/* Language switcher */}
        <div style={{ marginBottom: '1.5rem', textAlign: 'right' }}>
          <Link 
            to={heRoute}
            style={{ 
              color: 'var(--color-text-secondary, #666)',
              textDecoration: 'none',
              fontSize: '0.9375rem'
            }}
          >
            עברית
          </Link>
        </div>

        <h1 style={{ textAlign: 'left' }}>Content and Advertisement Policy [Website Name]</h1>
        <p className="legal-updated" style={{ textAlign: 'left' }}>
          <em>Last updated: ___</em>
        </p>

        <section>
          <h2 style={{ textAlign: 'left' }}>1. General</h2>
          <p style={{ textAlign: 'left' }}>1.1. This document details the content and advertisement policy on the website [Website Name] (hereinafter: "<strong>the Website</strong>"), and its purpose is to maintain a quality, reliable, and respectful user experience for all users.</p>
          <p style={{ textAlign: 'left' }}>1.2. This policy complements the website's terms of use, and in case of conflict – the terms of use provisions shall prevail.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>2. User Types and Advertisement Publishing</h2>
          <p style={{ textAlign: 'left' }}>2.1. The following may publish advertisements on the website:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li><strong>Private Sellers</strong> – private individuals publishing a vehicle they own.</li>
            <li><strong>Yards / Dealers</strong> – business entities managing a vehicle fleet.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>2.2. The operator may define different publishing rules for private sellers and yards (e.g., number of advertisements, image requirements, approval mechanism, etc.).</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>3. Basic Content Rules</h2>
          <p style={{ textAlign: 'left' }}>3.1. It is prohibited to publish content that includes, among other things:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>violent, racist, harmful, inciting, or defamatory content;</li>
            <li>explicit sexual content, nudity, or pornographic content;</li>
            <li>content that infringes copyrights, trademarks, privacy, or any third-party right;</li>
            <li>defamation of a person, entity, or organization;</li>
            <li>marketing/advertising content unrelated to the published vehicle;</li>
            <li>links to websites that violate the law, distribute malware, or harmful content.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>3.2. The publisher undertakes not to include in the advertisement false, partially misleading, inflated information, or information that may mislead users regarding the vehicle's condition, ownership, or other material details.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>4. Image Policy</h2>
          <p style={{ textAlign: 'left' }}>4.1. Images in advertisements are a central part of the service, and therefore the following requirements apply:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>Images must be of the specific vehicle published in the advertisement;</li>
            <li>Images from stock photo databases, general advertisements, or other websites without rights may not be used;</li>
            <li>Identifiable people in images (especially children) should not be displayed, as far as possible to avoid;</li>
            <li>Offensive, nude, violent, profane, or foreign advertisements may not be uploaded;</li>
            <li>Images containing large marketing text, banners, logos unrelated to the vehicle, etc., may not be used, unless approved in advance by the operator.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>4.2. The operator may limit:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>file format (e.g., JPG, PNG, WEBP only);</li>
            <li>file size (minimum and maximum);</li>
            <li>image resolution;</li>
            <li>number of images per advertisement.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>4.3. The operator may remove, blur, or reject images at its discretion if, in its opinion, they do not comply with this policy.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>5. Information Accuracy and Vehicle Descriptions</h2>
          <p style={{ textAlign: 'left' }}>5.1. The publisher undertakes to include, as far as possible, correct and accurate details regarding the vehicle, such as:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>manufacturer, model, year of manufacture, sub-model/version;</li>
            <li>mileage;</li>
            <li>transmission type, engine, fuel;</li>
            <li>known significant accidents/damage;</li>
            <li>ownership (private / leasing / company, etc.);</li>
            <li>any other material detail that affects a buyer's decision.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>5.2. Concealing material information or presenting the vehicle in a misleading manner may be considered a violation of the regulations and may result in removal of advertisements, account suspension, or blocking.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>6. Control Mechanism and Advertisement Approval</h2>
          <p style={{ textAlign: 'left' }}>6.1. The operator may, but is not obligated to, perform a preliminary review of advertisements and images before publication.</p>
          <p style={{ textAlign: 'left' }}>6.2. The operator may define that:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>advertisements from new users will first enter a "pending approval" status and will only be published after administrator review;</li>
            <li>yards/dealers who comply with the policy will receive priority and faster publication.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>6.3. The operator may remove, hide, or edit an advertisement and images (e.g., blurring a license plate) if, in its opinion, this is necessary to comply with the law or this policy.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>7. Reporting Problematic Content</h2>
          <p style={{ textAlign: 'left' }}>7.1. A user who encounters an advertisement or image that, in their opinion, does not comply with this policy may report it to the operator through a dedicated report button or through a "Contact" form.</p>
          <p style={{ textAlign: 'left' }}>7.2. The operator will examine the request according to reasonable capacity and resources, and does not undertake to remove all reported content.</p>
          <p style={{ textAlign: 'left' }}>7.3. The operator may, at its discretion, remove content, contact the publisher for clarifications, or leave the content unchanged.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>8. Sanctions for Policy Violation</h2>
          <p style={{ textAlign: 'left' }}>8.1. Without derogating from any other right available to the operator under law or the terms of use, the operator may take the following measures, all or part of them, in case of policy violation:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>removal of advertisements or images;</li>
            <li>holding advertisements in "suspended" or "pending review" status;</li>
            <li>limiting future publishing options;</li>
            <li>temporary or permanent blocking of a user account;</li>
            <li>reporting to competent authorities in case of suspicion of a criminal offense.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>8.2. Partial enforcement or non-enforcement by the operator does not create a right for the user or waive any right of the operator.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>9. Copyrights and Third-Party Rights</h2>
          <p style={{ textAlign: 'left' }}>9.1. The publisher declares that they have all rights to the content and images they upload, and that publishing the content does not infringe any third-party right.</p>
          <p style={{ textAlign: 'left' }}>9.2. The publisher agrees that in case a request with an apparent basis is received from a rights holder (e.g., photographer, company, person appearing in the image), the operator may remove the content immediately, without entering into a dispute between the parties.</p>
          <p style={{ textAlign: 'left' }}>9.3. The publisher bears full responsibility for any claim or demand made regarding content they uploaded, and will indemnify the operator for any damage caused to it as a result, as determined by law.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>10. Policy Updates</h2>
          <p style={{ textAlign: 'left' }}>10.1. The operator may update the content and advertisement policy from time to time.</p>
          <p style={{ textAlign: 'left' }}>10.2. Material updates may appear in a notice on the website. Continued use of the website after the policy update constitutes agreement to the updated policy.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>11. Contact</h2>
          <p style={{ textAlign: 'left' }}>For questions regarding the content policy or to report an advertisement/image:<br />
          Email: [Service Email]<br />
          Phone: [Service Phone Number]</p>
        </section>
      </div>
    </div>
  );
}
