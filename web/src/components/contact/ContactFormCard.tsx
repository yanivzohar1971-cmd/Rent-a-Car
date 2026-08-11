import { useState } from 'react';
import { createLead } from '../../api/leadsApi';
import type { CreateLeadParams } from '../../api/leadsApi';
import type { LeadSource, LeadSellerType } from '../../types/Lead';
import './ContactFormCard.css';

export type ContactReason = 'BUY' | 'FINANCE' | 'SELL' | 'TRADE_IN';

export interface ContactFormCardProps {
  carId?: string | null;
  yardPhone?: string | null;
  sellerType?: LeadSellerType;
  sellerId?: string | null;
  carTitle?: string | null;
  source?: LeadSource;
}

interface ContactFormValues {
  reasons: ContactReason[];
  fullName: string;
  email: string;
  phone: string;
  consent: boolean;
}

const REASON_LABELS: Record<ContactReason, string> = {
  BUY: 'קניית רכב',
  FINANCE: 'הצעת מימון רכב',
  SELL: 'מכירת רכב',
  TRADE_IN: 'טרייד אין',
};

export function ContactFormCard({
  carId,
  yardPhone,
  sellerType = 'YARD',
  sellerId,
  carTitle,
  source = 'WEB_SEARCH',
}: ContactFormCardProps) {
  const [formValues, setFormValues] = useState<ContactFormValues>({
    reasons: [],
    fullName: '',
    email: '',
    phone: '',
    consent: false,
  });

  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [errors, setErrors] = useState<{
    reasons?: string;
    fullName?: string;
    email?: string;
    phone?: string;
    consent?: string;
  }>({});

  const handleReasonToggle = (reason: ContactReason) => {
    setFormValues((prev) => ({
      ...prev,
      reasons: prev.reasons.includes(reason)
        ? prev.reasons.filter((r) => r !== reason)
        : [...prev.reasons, reason],
    }));
    // Clear error when user selects a reason
    if (errors.reasons) {
      setErrors((prev) => ({ ...prev, reasons: undefined }));
    }
  };

  const handlePhoneReveal = () => {
    if (!yardPhone) {
      return;
    }
    setPhoneRevealed(true);
    // Optionally open tel: link
    window.open(`tel:${yardPhone}`, '_self');
  };

  const validateForm = (): boolean => {
    const newErrors: typeof errors = {};

    if (formValues.reasons.length === 0) {
      newErrors.reasons = 'היי, לא לשכוח סיבת פנייה';
    }

    if (!formValues.fullName.trim() || formValues.fullName.trim().length < 2) {
      newErrors.fullName = 'שדה חובה';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formValues.email.trim()) {
      newErrors.email = 'שדה חובה';
    } else if (!emailRegex.test(formValues.email.trim())) {
      newErrors.email = 'כתובת אימייל לא תקינה';
    }

    const phoneRegex = /^[0-9+\-\s]{8,}$/;
    if (!formValues.phone.trim()) {
      newErrors.phone = 'שדה חובה';
    } else if (!phoneRegex.test(formValues.phone.trim())) {
      newErrors.phone = 'מספר טלפון לא תקין';
    }

    if (!formValues.consent) {
      newErrors.consent = 'יש לאשר את התקנון ומדיניות הפרטיות';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setShowErrors(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    if (!validateForm()) {
      return;
    }

    // Validate required props for lead creation
    if (!carId || !sellerId || !carTitle) {
      setSubmitError('אירעה שגיאה. נסה שוב בעוד רגע.');
      return;
    }

    setIsSubmitting(true);

    try {
      const reasonsLabels = formValues.reasons.map((r) => REASON_LABELS[r]);
      const note = `סיבות פנייה: ${reasonsLabels.join(', ')}`;

      const params: CreateLeadParams = {
        carId,
        carTitle,
        sellerType,
        sellerId,
        customerName: formValues.fullName.trim(),
        customerPhone: formValues.phone.trim(),
        customerEmail: formValues.email.trim() || undefined,
        note,
        source,
      };

      await createLead(params);

      // Success
      setSubmitSuccess(true);
      setSubmitError(null);

      // Clear form
      setFormValues({
        reasons: [],
        fullName: '',
        email: '',
        phone: '',
        consent: false,
      });
      setShowErrors(false);
      setErrors({});
    } catch (err) {
      console.error('Error creating lead:', err);
      setSubmitError('אירעה שגיאה בשמירת הפרטים. נסה שוב בעוד רגע.');
      setSubmitSuccess(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="contact-form-card" dir="rtl">
      <h3 className="contact-form-title">יצירת קשר</h3>

      {/* Phone reveal button */}
      {yardPhone && (
        <button
          type="button"
          className="btn-phone-reveal"
          onClick={handlePhoneReveal}
          disabled={isSubmitting}
        >
          <span className="btn-phone-text">הצגת מס' טלפון</span>
          <span className="btn-phone-icon">📞</span>
        </button>
      )}

      {phoneRevealed && yardPhone && (
        <div className="phone-revealed">
          <a href={`tel:${yardPhone}`} className="phone-link" dir="ltr">
            {yardPhone}
          </a>
        </div>
      )}

      {/* Divider */}
      <div className="contact-divider">
        <div className="divider-line"></div>
        <span className="divider-text">או השארת פרטים</span>
        <div className="divider-line"></div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="contact-form">
        {/* Reason for contact */}
        <div className="form-group">
          <label className="form-label-bold">סיבת פנייה</label>
          <div className="reasons-group">
            {Object.entries(REASON_LABELS).map(([reason, label]) => (
              <label key={reason} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={formValues.reasons.includes(reason as ContactReason)}
                  onChange={() => handleReasonToggle(reason as ContactReason)}
                  disabled={isSubmitting}
                  className="checkbox-input"
                />
                <span className="checkbox-text">{label}</span>
              </label>
            ))}
          </div>
          {showErrors && errors.reasons && (
            <span className="field-error">{errors.reasons}</span>
          )}
        </div>

        {/* Full name */}
        <div className="form-group">
          <label className="form-label">שם מלא</label>
          <input
            type="text"
            className={`form-input ${showErrors && errors.fullName ? 'input-error' : ''}`}
            value={formValues.fullName}
            onChange={(e) => {
              setFormValues((prev) => ({ ...prev, fullName: e.target.value }));
              if (errors.fullName) {
                setErrors((prev) => ({ ...prev, fullName: undefined }));
              }
            }}
            disabled={isSubmitting}
          />
          {showErrors && errors.fullName && (
            <span className="field-error">{errors.fullName}</span>
          )}
        </div>

        {/* Email */}
        <div className="form-group">
          <label className="form-label">מייל</label>
          <input
            type="email"
            className={`form-input ${showErrors && errors.email ? 'input-error' : ''}`}
            value={formValues.email}
            onChange={(e) => {
              setFormValues((prev) => ({ ...prev, email: e.target.value }));
              if (errors.email) {
                setErrors((prev) => ({ ...prev, email: undefined }));
              }
            }}
            disabled={isSubmitting}
            dir="ltr"
          />
          {showErrors && errors.email && (
            <span className="field-error">{errors.email}</span>
          )}
        </div>

        {/* Phone */}
        <div className="form-group">
          <label className="form-label">📞 טלפון</label>
          <input
            type="tel"
            className={`form-input ${showErrors && errors.phone ? 'input-error' : ''}`}
            value={formValues.phone}
            onChange={(e) => {
              setFormValues((prev) => ({ ...prev, phone: e.target.value }));
              if (errors.phone) {
                setErrors((prev) => ({ ...prev, phone: undefined }));
              }
            }}
            disabled={isSubmitting}
            dir="ltr"
          />
          {showErrors && errors.phone && (
            <span className="field-error">{errors.phone}</span>
          )}
        </div>

        {/* Consent checkbox */}
        <div className="form-group">
          <label className="checkbox-label consent-checkbox">
            <input
              type="checkbox"
              checked={formValues.consent}
              onChange={(e) => {
                setFormValues((prev) => ({ ...prev, consent: e.target.checked }));
                if (errors.consent) {
                  setErrors((prev) => ({ ...prev, consent: undefined }));
                }
              }}
              disabled={isSubmitting}
              className="checkbox-input"
            />
            <span className="checkbox-text consent-text">
              אני מאשר/ת את התקנון ומדיניות הפרטיות באתר ומאשר/ת לקבל עדכונים/הצעות מהמגרש או מהמערכת (כולל דיוור ישיר) באמצעות הקשר שמסרתי.
            </span>
          </label>
          {showErrors && errors.consent && (
            <span className="field-error">{errors.consent}</span>
          )}
        </div>

        {/* Success message */}
        {submitSuccess && (
          <div className="success-message">
            הפרטים נשלחו בהצלחה
          </div>
        )}

        {/* Error message */}
        {submitError && (
          <div className="error-message">
            {submitError}
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          className="btn btn-primary submit-button"
          disabled={isSubmitting || (showErrors && Object.keys(errors).length > 0)}
        >
          {isSubmitting ? 'שולח...' : 'שליחה'}
        </button>
      </form>
    </div>
  );
}

