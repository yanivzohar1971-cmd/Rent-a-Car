import { Link } from 'react-router-dom';
import './LegalPage.css';

export default function LegalTermsPageEn() {
  // Hebrew route for this page
  const heRoute = '/legal/terms';

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

        <h1 style={{ textAlign: 'left' }}>Terms of Use and Website Regulations [Website Name]</h1>
        <p className="legal-updated" style={{ textAlign: 'left' }}>
          <em>Last updated: ___</em>
        </p>

        <section>
          <h2 style={{ textAlign: 'left' }}>1. General</h2>
          <p style={{ textAlign: 'left' }}>1.1. These regulations define the terms of use of the website and the services provided through it (hereinafter: "<strong>the Website</strong>" and "<strong>the Service</strong>"), operated by [Company Name / Website Owner] (hereinafter: "<strong>the Operator</strong>").</p>
          <p style={{ textAlign: 'left' }}>1.2. Use of the website, including browsing, registration, posting advertisements, contacting advertisers, use as a professional/yard, etc. – constitutes full and irrevocable agreement to the terms of these regulations.</p>
          <p style={{ textAlign: 'left' }}>1.3. If you do not agree to the terms of these regulations, in whole or in part – you are not permitted to use the website.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>2. Definitions</h2>
          <p style={{ textAlign: 'left' }}>In these regulations:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>"<strong>User</strong>" – any person browsing the website, registered or unregistered.</li>
            <li>"<strong>Publisher</strong>" – a user who publishes an advertisement for the sale or rental of a vehicle, whether as a private seller or as a yard/dealer.</li>
            <li>"<strong>Buyer</strong>" – a user who contacts a publisher regarding a vehicle.</li>
            <li>"<strong>Yard</strong>" – a business user approved by the operator who manages a vehicle fleet through the system.</li>
            <li>"<strong>Advertisement</strong>" – any publication of a vehicle, text, image, video, or any other information uploaded by a user to the website.</li>
            <li>"<strong>Content</strong>" – any information appearing on the website, including advertisements, images, texts, comments, messages, etc.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>3. Registration, User Account and Roles</h2>
          <p style={{ textAlign: 'left' }}>3.1. To use some services (e.g., posting an advertisement, managing a yard, viewing leads), registration and opening a user account are required.</p>
          <p style={{ textAlign: 'left' }}>3.2. Upon registration, the user undertakes to provide correct, accurate, and complete details, and to update them as necessary.</p>
          <p style={{ textAlign: 'left' }}>3.3. The operator may, at its discretion, approve or reject a request to be:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>a yard/dealer,</li>
            <li>an agent,</li>
            <li>a private publishing user,</li>
            <li>or any other role required in the system.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>3.4. The operator may cancel, block, or restrict a user account in any case of violation of the regulations, misuse of the service, providing false details, or at its reasonable discretion.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>4. Website Services and Operator Responsibility</h2>
          <p style={{ textAlign: 'left' }}>4.1. The website serves as a platform that enables:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>publishing vehicle advertisements by yards and private sellers,</li>
            <li>searching for vehicles,</li>
            <li>creating contact between buyers and publishers,</li>
            <li>managing leads and data by yards and dealers,</li>
            <li>and any other ancillary service the operator chooses to add.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>4.2. The operator <strong>is not a party to transactions</strong> conducted between buyers and publishers, is not the owner of the vehicles, and is not responsible for their quality, condition, ownership, or any representation made regarding the vehicles.</p>
          <p style={{ textAlign: 'left' }}>4.3. Any transaction actually conducted between a buyer and a publisher (yard or private seller) is at the full and exclusive responsibility of the parties to the transaction. The operator is not and will not be responsible for any direct or indirect, financial or other damage caused as a result of such a transaction.</p>
          <p style={{ textAlign: 'left' }}>4.4. The operator reserves the right to change, discontinue, update, or restrict the services on the website, in whole or in part, at any time, without prior notice.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>5. Publishing Advertisements and Publisher Obligations</h2>
          <p style={{ textAlign: 'left' }}>5.1. When publishing an advertisement, the publisher undertakes that:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>they are the legal owner of the vehicle or authorized to publish it;</li>
            <li>the details in the advertisement are as accurate as possible;</li>
            <li>the publication does not constitute misrepresentation or fraud;</li>
            <li>the images reflect the actual vehicle as much as possible.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>5.2. The publisher undertakes not to publish:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>incorrect or false details;</li>
            <li>duplicate/repeated advertisements on the same platform contrary to the website's policy;</li>
            <li>content that infringes third-party rights, including copyrights, trademarks, privacy, etc.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>5.3. The operator may remove advertisements, edit them, hide them, or limit their exposure if, in its opinion, they contain:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>a violation of the regulations,</li>
            <li>a risk of misleading the public,</li>
            <li>or a violation of the website's content policy.</li>
          </ul>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>6. Payment, Fees and Service Upgrades</h2>
          <p style={{ textAlign: 'left' }}>6.1. Some services on the website may involve payment (e.g., extended publication package, advertisement promotion, yard/PRO package, etc.).</p>
          <p style={{ textAlign: 'left' }}>6.2. Payment terms, prices, subscription periods, refunds, and cancellations – will be detailed on the relevant service pages on the website, and they constitute an integral part of these terms of use.</p>
          <p style={{ textAlign: 'left' }}>6.3. The operator may update from time to time the service rates, fee policy, and subscription plans, and the updates will take effect from the time of their publication on the website onwards.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>7. Responsibility, Declarations and Limitations</h2>
          <p style={{ textAlign: 'left' }}>7.1. The website and services are provided in their current format ("As Is") without any commitment or responsibility of any kind, express or implied.</p>
          <p style={{ textAlign: 'left' }}>7.2. The operator does not undertake that the service will be provided without interruptions, disruptions, failures, malfunctions, or availability limitations.</p>
          <p style={{ textAlign: 'left' }}>7.3. In no case shall the operator be liable for any indirect, consequential, loss of profits, loss of data, or any other damage resulting from use of the website or in connection with transactions conducted as a result thereof.</p>
          <p style={{ textAlign: 'left' }}>7.4. In any case where it is determined that the operator has any responsibility, its cumulative responsibility shall not exceed the amount actually paid by the user to the operator for the relevant service in respect of which the damage was caused (if such was paid).</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>8. Permitted and Prohibited Use of the Website</h2>
          <p style={{ textAlign: 'left' }}>8.1. The user undertakes to use the website only in accordance with the law and the regulations.</p>
          <p style={{ textAlign: 'left' }}>8.2. The user is prohibited, among other things, from:</p>
          <ul style={{ textAlign: 'left', paddingLeft: '2rem' }}>
            <li>uploading offensive, violent, racist, harmful, inciting, or illegal content;</li>
            <li>performing automated use of the website (scraping, bots) without prior written approval;</li>
            <li>attempting to bypass security or access mechanisms;</li>
            <li>collecting or storing information about other users without their consent.</li>
          </ul>
          <p style={{ textAlign: 'left' }}>8.3. The operator may take technical and legal measures against any user who violates the terms of the regulations or the law.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>9. Intellectual Property</h2>
          <p style={{ textAlign: 'left' }}>9.1. All rights in the website – including the website name, logo, design, code, databases, texts, graphics, etc. – are owned by the operator or third parties who have granted the operator a license.</p>
          <p style={{ textAlign: 'left' }}>9.2. The user is not permitted to copy, reproduce, distribute, translate, sell, modify, or make commercial use of content belonging to the operator, without obtaining explicit prior written approval.</p>
          <p style={{ textAlign: 'left' }}>9.3. Content uploaded by a user (including advertisements and images) remains their property, however the publisher grants the operator a non-exclusive, worldwide, royalty-free license to use the content for the purpose of display, distribution, marketing, and promotion of the website, including in various displays, landing pages, etc., subject to the privacy policy.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>10. Privacy</h2>
          <p style={{ textAlign: 'left' }}>10.1. Use of the website is also subject to the operator's privacy policy, published separately on the website.</p>
          <p style={{ textAlign: 'left' }}>10.2. By using the website, the user confirms that they have read the privacy policy and agree to it.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>11. Changes to the Regulations</h2>
          <p style={{ textAlign: 'left' }}>11.1. The operator may update the terms of these regulations from time to time.</p>
          <p style={{ textAlign: 'left' }}>11.2. Notice of a material change will be published on the website and/or sent to registered users. Continued use of the website after the change will constitute agreement to the updated regulations.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>12. Law and Jurisdiction</h2>
          <p style={{ textAlign: 'left' }}>12.1. These regulations shall be governed solely by the laws of the State of Israel.</p>
          <p style={{ textAlign: 'left' }}>12.2. The exclusive jurisdiction in any dispute relating to these regulations and/or use of the website shall be with the competent courts in the [Tel Aviv/Central/Haifa – to choose] district.</p>
        </section>

        <section>
          <h2 style={{ textAlign: 'left' }}>13. Contact</h2>
          <p style={{ textAlign: 'left' }}>For questions, clarifications, or inquiries, please contact:<br />
          [Company Name / Website Owner]<br />
          Email: [Service Email]<br />
          Phone: [Service Phone Number]</p>
        </section>
      </div>
    </div>
  );
}
