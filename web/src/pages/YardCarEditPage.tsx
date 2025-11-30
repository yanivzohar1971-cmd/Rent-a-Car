import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import CarBrandAutocomplete from '../components/CarBrandAutocomplete';
import CarModelAutocomplete from '../components/CarModelAutocomplete';
import { saveYardCar, loadYardCar } from '../api/yardCarsApi';
import { getBrands } from '../catalog/carCatalog';
import type { YardCarFormData } from '../api/yardCarsApi';
import type { CatalogBrand, CatalogModel } from '../catalog/carCatalog';
import './YardCarEditPage.css';

export default function YardCarEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(!!id);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state - tracking both IDs and text
  const [brandText, setBrandText] = useState('');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [modelText, setModelText] = useState('');
  const [modelId, setModelId] = useState<string | null>(null);
  
  const [year, setYear] = useState('');
  const [price, setPrice] = useState('');
  const [mileageKm, setMileageKm] = useState('');
  const [city, setCity] = useState('');
  const [notes, setNotes] = useState('');

  // Preload catalog on page mount
  useEffect(() => {
    async function preloadCatalog() {
      try {
        console.log('YardCarEditPage: preloading catalog...');
        const brands = await getBrands();
        console.log('YardCarEditPage: catalog preloaded', { brandsCount: brands.length });
      } catch (error) {
        console.error('YardCarEditPage: error preloading catalog', error);
      }
    }
    preloadCatalog();
  }, []);

  // Load car if editing
  useEffect(() => {
    if (!id) {
      setIsLoading(false);
      return;
    }

    async function loadCar() {
      try {
        const auth = getAuth();
        if (!auth.currentUser) {
          setError('נדרשת התחברות לעריכת רכב');
          setIsLoading(false);
          return;
        }

        if (!id) {
          setError('מזהה רכב לא תקין');
          setIsLoading(false);
          return;
        }
        const carData = await loadYardCar(id);
        if (carData) {
          setBrandText(carData.brandText);
          setBrandId(carData.brandId);
          setModelText(carData.modelText);
          setModelId(carData.modelId);
          setYear(carData.year);
          setPrice(carData.price);
          setMileageKm(carData.mileageKm);
          setCity(carData.city || '');
          setNotes(carData.notes || '');
        } else {
          setError('הרכב לא נמצא');
        }
      } catch (err) {
        console.error('Error loading car:', err);
        setError('שגיאה בטעינת הרכב');
      } finally {
        setIsLoading(false);
      }
    }

    loadCar();
  }, [id]);

  const handleBrandSelected = (brand: CatalogBrand | null) => {
    if (brand) {
      setBrandId(brand.brandId);
      setBrandText(brand.brandHe);
      // Clear model when brand changes
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const auth = getAuth();
    if (!auth.currentUser) {
      setError('נדרשת התחברות לשמירת רכב');
      return;
    }

    setIsSaving(true);

    try {
      const carData: YardCarFormData = {
        brandId,
        brandText,
        modelId,
        modelText,
        year,
        price,
        mileageKm,
        city: city || undefined,
        notes: notes || undefined,
      };

      await saveYardCar(id || null, carData);
      
      // Navigate back or to car details
      navigate('/yard/cars');
    } catch (err: any) {
      console.error('Error saving car:', err);
      setError(err.message || 'שגיאה בשמירת הרכב');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/yard/cars');
  };

  if (isLoading) {
    return (
      <div className="yard-car-edit-page">
        <div className="loading-container">
          <p>טוען...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="yard-car-edit-page">
      <div className="page-container">
        <h1 className="page-title">{id ? 'עריכת רכב' : 'הוספת רכב'}</h1>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="car-edit-form">
          <div className="form-section">
            <h2 className="section-title">פרטי רכב</h2>

            <div className="form-group">
              <label className="form-label">יצרן *</label>
              <CarBrandAutocomplete
                value={brandText}
                selectedBrandId={brandId}
                onValueChange={setBrandText}
                onBrandSelected={handleBrandSelected}
                placeholder="לדוגמה: טויוטה"
              />
            </div>

            <div className="form-group">
              <label className="form-label">דגם *</label>
              <CarModelAutocomplete
                value={modelText}
                selectedModelId={modelId}
                brandId={brandId}
                onValueChange={setModelText}
                onModelSelected={handleModelSelected}
                placeholder="לדוגמה: קורולה"
                disabled={!brandId}
              />
            </div>

            <div className="form-group">
              <label className="form-label">שנת ייצור</label>
              <input
                type="number"
                className="form-input"
                value={year}
                onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
                placeholder="למשל: 2020"
                min="1900"
                max={new Date().getFullYear() + 1}
              />
            </div>

            <div className="form-group">
              <label className="form-label">מחיר (₪)</label>
              <input
                type="number"
                className="form-input"
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))}
                placeholder="למשל: 78000"
                min="0"
              />
            </div>

            <div className="form-group">
              <label className="form-label">קילומטראז' (ק"מ)</label>
              <input
                type="number"
                className="form-input"
                value={mileageKm}
                onChange={(e) => setMileageKm(e.target.value.replace(/\D/g, ''))}
                placeholder="למשל: 82000"
                min="0"
              />
            </div>

            <div className="form-group">
              <label className="form-label">עיר</label>
              <input
                type="text"
                className="form-input"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="למשל: תל אביב"
              />
            </div>

            <div className="form-group">
              <label className="form-label">הערות</label>
              <textarea
                className="form-input form-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הערות נוספות על הרכב..."
                rows={4}
              />
            </div>
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleCancel}
              disabled={isSaving}
            >
              ביטול
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving || !brandText.trim()}
            >
              {isSaving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

