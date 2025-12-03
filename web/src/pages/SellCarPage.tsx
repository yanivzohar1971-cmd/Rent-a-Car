import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { doc, getDocFromServer, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import CarBrandAutocomplete from '../components/CarBrandAutocomplete';
import CarModelAutocomplete from '../components/CarModelAutocomplete';
import { createCarAd } from '../api/carAdsApi';
import type { CatalogBrand, CatalogModel } from '../catalog/carCatalog';
import { GearboxType, FuelType } from '../types/carTypes';
import './SellCarPage.css';

export default function SellCarPage() {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  
  // Form state
  const [brandText, setBrandText] = useState('');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [modelText, setModelText] = useState('');
  const [modelId, setModelId] = useState<string | null>(null);
  const [year, setYear] = useState('');
  const [price, setPrice] = useState('');
  const [mileageKm, setMileageKm] = useState('');
  const [city, setCity] = useState('');
  const [gearboxType, setGearboxType] = useState<string>('');
  const [fuelType, setFuelType] = useState<string>('');
  const [color, setColor] = useState('');
  const [handCount, setHandCount] = useState('');
  const [description, setDescription] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  
  // Images
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Redirect if not authenticated
  if (!firebaseUser) {
    navigate('/account');
    return null;
  }

  const handleBrandSelected = (brand: CatalogBrand | null) => {
    if (brand) {
      setBrandId(brand.brandId);
      setBrandText(brand.brandHe);
      setModelId(null);
      setModelText('');
    } else {
      setBrandId(null);
    }
  };

  const handleModelSelected = (model: CatalogModel | null) => {
    if (model) {
      setModelId(model.modelId);
      setModelText(model.modelHe);
    } else {
      setModelId(null);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate file size (max 5MB per file)
    const validFiles: File[] = [];
    const invalidFiles: string[] = [];

    files.forEach((file) => {
      if (file.size > 5 * 1024 * 1024) {
        invalidFiles.push(file.name);
      } else {
        validFiles.push(file);
      }
    });

    if (invalidFiles.length > 0) {
      setError(`הקבצים הבאים גדולים מדי (מעל 5MB): ${invalidFiles.join(', ')}`);
    }

    if (validFiles.length > 0) {
      setImageFiles((prev) => [...prev, ...validFiles]);
      
      // Create previews
      validFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result;
          if (result && typeof result === 'string') {
            setImagePreviews((prev) => [...prev, result]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleRemoveImage = (index: number) => {
    setImageFiles((prev) => prev.filter((_, i) => i !== index));
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!brandText.trim()) {
      errors.manufacturer = 'נדרש לבחור יצרן';
    }
    if (!modelText.trim()) {
      errors.model = 'נדרש לבחור דגם';
    }
    if (!year.trim()) {
      errors.year = 'נדרש להזין שנה';
    } else {
      const yearNum = parseInt(year, 10);
      if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
        errors.year = 'שנה לא תקינה';
      }
    }
    if (!city.trim()) {
      errors.city = 'נדרש להזין עיר';
    }
    if (!price.trim()) {
      errors.price = 'נדרש להזין מחיר';
    } else {
      const priceNum = parseFloat(price);
      if (isNaN(priceNum) || priceNum <= 0 || priceNum > 10000000) {
        errors.price = 'מחיר לא תקין (0-10,000,000)';
      }
    }
    if (!mileageKm.trim()) {
      errors.mileageKm = 'נדרש להזין קילומטראז׳';
    } else {
      const mileageNum = parseFloat(mileageKm);
      if (isNaN(mileageNum) || mileageNum < 0 || mileageNum > 1000000) {
        errors.mileageKm = 'קילומטראז׳ לא תקין (0-1,000,000)';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setValidationErrors({});

    if (!validateForm()) {
      return;
    }

    if (!firebaseUser) {
      setError('נדרשת התחברות לפרסום מודעה');
      return;
    }

    setIsSaving(true);

    try {
      const ad = await createCarAd({
        manufacturer: brandText,
        manufacturerId: brandId,
        model: modelText,
        modelId: modelId,
        year: parseInt(year, 10),
        mileageKm: parseFloat(mileageKm),
        price: parseFloat(price),
        city: city.trim(),
        gearboxType: gearboxType || null,
        fuelType: fuelType || null,
        color: color.trim() || null,
        handCount: handCount ? parseInt(handCount, 10) : null,
        description: description.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        imageFiles: imageFiles.length > 0 ? imageFiles : undefined,
      });

      // Update user role to SELLER if needed
      try {
        const userRef = doc(db, 'users', firebaseUser.uid);
        const userSnap = await getDocFromServer(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData.canSell === false || userData.canSell === undefined) {
            await updateDoc(userRef, {
              canSell: true,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (err) {
        console.error('Error updating user role:', err);
        // Non-fatal
      }

      // Redirect to the public car page
      navigate(`/car/${ad.id}`, { state: { success: true, message: 'המודעה פורסמה בהצלחה!' } });
    } catch (err: any) {
      console.error('Error creating car ad:', err);
      setError(err.message || 'שגיאה בפרסום המודעה');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="sell-car-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">פרסום מודעת רכב למכירה</h1>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/')}
          >
            ביטול
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <form onSubmit={handleSubmit} className="sell-car-form">
          {/* Basic Info */}
          <div className="form-section">
            <h2 className="section-title">פרטים בסיסיים *</h2>
            
            <div className="form-group">
              <label className="form-label">יצרן *</label>
              <CarBrandAutocomplete
                value={brandText}
                selectedBrandId={brandId}
                onValueChange={setBrandText}
                onBrandSelected={handleBrandSelected}
                placeholder="לדוגמה: טויוטה"
              />
              {validationErrors.manufacturer && (
                <span className="field-error">{validationErrors.manufacturer}</span>
              )}
            </div>

            <div className="form-group">
              <label className="form-label">דגם *</label>
              <CarModelAutocomplete
                value={modelText}
                brandId={brandId}
                selectedModelId={modelId}
                onValueChange={setModelText}
                onModelSelected={handleModelSelected}
                placeholder="לדוגמה: קורולה"
                disabled={!brandId}
              />
              {validationErrors.model && (
                <span className="field-error">{validationErrors.model}</span>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">שנה *</label>
                <input
                  type="number"
                  className="form-input"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  min="1900"
                  max={new Date().getFullYear() + 1}
                  required
                />
                {validationErrors.year && (
                  <span className="field-error">{validationErrors.year}</span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">קילומטראז׳ (ק״מ) *</label>
                <input
                  type="number"
                  className="form-input"
                  value={mileageKm}
                  onChange={(e) => setMileageKm(e.target.value)}
                  min="0"
                  max="1000000"
                  required
                />
                {validationErrors.mileageKm && (
                  <span className="field-error">{validationErrors.mileageKm}</span>
                )}
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">מחיר (₪) *</label>
                <input
                  type="number"
                  className="form-input"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  min="0"
                  max="10000000"
                  required
                />
                {validationErrors.price && (
                  <span className="field-error">{validationErrors.price}</span>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">עיר *</label>
                <input
                  type="text"
                  className="form-input"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                />
                {validationErrors.city && (
                  <span className="field-error">{validationErrors.city}</span>
                )}
              </div>
            </div>
          </div>

          {/* Additional Details */}
          <div className="form-section">
            <h2 className="section-title">פרטים נוספים</h2>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">סוג גיר</label>
                <select
                  className="form-input"
                  value={gearboxType}
                  onChange={(e) => setGearboxType(e.target.value)}
                >
                  <option value="">לא צוין</option>
                  <option value={GearboxType.AUTOMATIC}>אוטומטי</option>
                  <option value={GearboxType.MANUAL}>ידני</option>
                  <option value={GearboxType.ROBOTIC}>רובוטי</option>
                  <option value={GearboxType.CVT}>CVT</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">סוג דלק</label>
                <select
                  className="form-input"
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value)}
                >
                  <option value="">לא צוין</option>
                  <option value={FuelType.BENZIN}>בנזין</option>
                  <option value={FuelType.DIESEL}>דיזל</option>
                  <option value={FuelType.HYBRID}>היברידי</option>
                  <option value={FuelType.PLUG_IN}>היברידי נטען</option>
                  <option value={FuelType.ELECTRIC}>חשמלי</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">צבע</label>
                <input
                  type="text"
                  className="form-input"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">מספר ידיים</label>
                <input
                  type="number"
                  className="form-input"
                  value={handCount}
                  onChange={(e) => setHandCount(e.target.value)}
                  min="1"
                  max="10"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">תיאור</label>
              <textarea
                className="form-input form-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={1000}
                placeholder="תיאור מפורט של הרכב, מצב, היסטוריה, וכו'."
              />
            </div>
          </div>

          {/* Contact Info */}
          <div className="form-section">
            <h2 className="section-title">פרטי יצירת קשר</h2>
            
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">טלפון</label>
                <input
                  type="tel"
                  className="form-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  dir="ltr"
                />
              </div>

              <div className="form-group">
                <label className="form-label">דוא״ל</label>
                <input
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          {/* Images */}
          <div className="form-section">
            <h2 className="section-title">תמונות</h2>
            
            <div className="image-upload-area">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageSelect}
                style={{ display: 'none' }}
                id="image-upload-input"
              />
              <label htmlFor="image-upload-input" className="btn btn-secondary">
                הוסף תמונות
              </label>
              <p className="upload-note">ניתן להעלות מספר תמונות (עד 5MB כל אחת)</p>
            </div>

            {imagePreviews.length > 0 && (
              <div className="image-previews">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="image-preview-item">
                    <img src={preview} alt={`תמונה ${index + 1}`} />
                    <button
                      type="button"
                      className="btn-remove-image"
                      onClick={() => handleRemoveImage(index)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Submit */}
          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => navigate('/')}
              disabled={isSaving}
            >
              ביטול
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? 'מפרסם...' : 'פרסם מודעה'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

