import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getAuth } from 'firebase/auth';
import CarBrandAutocomplete from '../components/CarBrandAutocomplete';
import CarModelAutocomplete from '../components/CarModelAutocomplete';
import { saveYardCar, loadYardCar } from '../api/yardCarsApi';
import { getBrands } from '../catalog/carCatalog';
import { listCarImages, uploadCarImage, deleteCarImage, updateCarImagesOrder, type YardCarImage } from '../api/yardImagesApi';
import type { YardCarFormData } from '../api/yardCarsApi';
import { resolvePublicCarIdForCarSale } from '../api/yardFleetApi';
import { doc, getDocFromServer } from 'firebase/firestore';
import { db } from '../firebase/firebaseClient';
import { normalizeCarImages } from '../utils/carImageHelper';
import type { CatalogBrand, CatalogModel } from '../catalog/carCatalog';
import { GearboxType, FuelType, BodyType, getGearboxTypeLabel, getFuelTypeLabel, getBodyTypeLabel } from '../types/carTypes';
import './YardCarEditPage.css';

export default function YardCarEditPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(!!id);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Images state
  const [currentCarId, setCurrentCarId] = useState<string | null>(id || null);
  const [images, setImages] = useState<YardCarImage[]>([]);
  const [externalImages, setExternalImages] = useState<string[]>([]); // Read-only images from publicCars/carSales
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ total: 0, completed: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Drag & drop state
  const [draggingImageId, setDraggingImageId] = useState<string | null>(null);
  const [dragOverImageId, setDragOverImageId] = useState<string | null>(null);
  
  // Lightbox state
  const [lightboxImageIndex, setLightboxImageIndex] = useState<number | null>(null);

  // Form state - tracking both IDs and text
  const [brandText, setBrandText] = useState('');
  const [brandId, setBrandId] = useState<string | null>(null);
  const [modelText, setModelText] = useState('');
  const [modelId, setModelId] = useState<string | null>(null);
  
  // Core fields
  const [year, setYear] = useState('');
  const [price, setPrice] = useState('');
  const [mileageKm, setMileageKm] = useState('');
  const [city, setCity] = useState('');
  
  // Identification fields
  const [licensePlatePartial, setLicensePlatePartial] = useState('');
  const [vin, setVin] = useState('');
  const [stockNumber, setStockNumber] = useState('');
  
  // Technical fields
  const [gearboxType, setGearboxType] = useState('');
  const [fuelType, setFuelType] = useState('');
  const [bodyType, setBodyType] = useState('');
  const [engineDisplacementCc, setEngineDisplacementCc] = useState('');
  const [horsepower, setHorsepower] = useState('');
  const [numberOfGears, setNumberOfGears] = useState('');
  const [color, setColor] = useState('');
  
  // Ownership fields
  const [handCount, setHandCount] = useState('');
  const [ownershipType, setOwnershipType] = useState('');
  const [importType, setImportType] = useState('');
  const [previousUse, setPreviousUse] = useState('');
  
  // Condition fields
  const [hasAccidents, setHasAccidents] = useState<boolean | undefined>(undefined);
  const [hasAC, setHasAC] = useState<boolean | undefined>(undefined);
  
  // Notes
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
          // Core fields
          setBrandText(carData.brandText);
          setBrandId(carData.brandId);
          setModelText(carData.modelText);
          setModelId(carData.modelId);
          setYear(carData.year);
          setPrice(carData.price);
          setMileageKm(carData.mileageKm);
          setCity(carData.city || '');
          
          // Identification fields
          setLicensePlatePartial(carData.licensePlatePartial || '');
          setVin(carData.vin || '');
          setStockNumber(carData.stockNumber || '');
          
          // Technical fields
          setGearboxType(carData.gearboxType || '');
          setFuelType(carData.fuelType || '');
          setBodyType(carData.bodyType || '');
          setEngineDisplacementCc(carData.engineDisplacementCc || '');
          setHorsepower(carData.horsepower || '');
          setNumberOfGears(carData.numberOfGears || '');
          setColor(carData.color || '');
          
          // Ownership fields
          setHandCount(carData.handCount || '');
          setOwnershipType(carData.ownershipType || '');
          setImportType(carData.importType || '');
          setPreviousUse(carData.previousUse || '');
          
          // Condition fields
          setHasAccidents(carData.hasAccidents);
          setHasAC(carData.hasAC);
          
          // Notes
          setNotes(carData.notes || '');
          
          setCurrentCarId(id);
          
          // Load images for existing car
          await loadImages(id);
          
          // Load external images from publicCars/carSales
          await loadExternalImages(id);
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

  // Load images for a car
  const loadImages = async (carId: string) => {
    const auth = getAuth();
    if (!auth.currentUser) return;

    setImagesLoading(true);
    setImagesError(null);
    try {
      const loadedImages = await listCarImages(auth.currentUser.uid, carId);
      // Sort by order to ensure correct display order
      const sortedImages = [...loadedImages].sort((a, b) => a.order - b.order);
      setImages(sortedImages);
    } catch (err: any) {
      console.error('Error loading images:', err);
      setImagesError('שגיאה בטעינת התמונות');
    } finally {
      setImagesLoading(false);
    }
  };

  // Load external images from publicCars/carSales (read-only)
  const loadExternalImages = async (carId: string) => {
    const auth = getAuth();
    if (!auth.currentUser) return;

    try {
      // First, try to get publicCars data
      const publicCarId = await resolvePublicCarIdForCarSale(carId);
      if (publicCarId) {
        const publicCarDoc = await getDocFromServer(doc(db, 'publicCars', publicCarId));
        if (publicCarDoc.exists()) {
          const pubData = publicCarDoc.data();
          const normalized = normalizeCarImages(pubData);
          if (normalized.imageUrls && normalized.imageUrls.length > 0) {
            setExternalImages(normalized.imageUrls);
            return;
          }
        }
      }

      // Fallback: check carSales document for image data
      const carSalesDoc = await getDocFromServer(doc(db, 'users', auth.currentUser.uid, 'carSales', carId));
      if (carSalesDoc.exists()) {
        const carData = carSalesDoc.data();
        const normalized = normalizeCarImages(carData);
        if (normalized.imageUrls && normalized.imageUrls.length > 0) {
          setExternalImages(normalized.imageUrls);
          return;
        }
      }

      // No external images found
      setExternalImages([]);
    } catch (err: any) {
      console.error('Error loading external images:', err);
      // Non-blocking error - just log it
      setExternalImages([]);
    }
  };

  // Handle Escape key for lightbox
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && lightboxImageIndex !== null) {
        setLightboxImageIndex(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [lightboxImageIndex]);

  // Handle image upload (multiple files support)
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const auth = getAuth();
    if (!auth.currentUser) {
      setImagesError('נדרשת התחברות להעלאת תמונות');
      return;
    }

    // Check if carId is available
    if (!currentCarId) {
      setImagesError('שמירת הרכב נדרשת לפני העלאת תמונות');
      return;
    }

    // Convert FileList to array and validate
    const fileArray = Array.from(files);
    const validFiles: File[] = [];
    const errors: string[] = [];

    for (const file of fileArray) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        errors.push(`הקובץ ${file.name} אינו קובץ תמונה`);
        continue;
      }

      // Validate file size (max 5MB per file)
      if (file.size > 5 * 1024 * 1024) {
        errors.push(`הקובץ ${file.name} גדול מדי (מקסימום 5MB)`);
        continue;
      }

      validFiles.push(file);
    }

    if (errors.length > 0) {
      setImagesError(errors.join('; '));
    }

    if (validFiles.length === 0) {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      return;
    }

    setIsUploading(true);
    setUploadProgress({ total: validFiles.length, completed: 0 });
    setImagesError(null);

    const uploadedImages: YardCarImage[] = [];
    const uploadErrors: string[] = [];

    // Upload files sequentially
    for (let i = 0; i < validFiles.length; i++) {
      try {
        const newImage = await uploadCarImage(auth.currentUser!.uid, currentCarId, validFiles[i]);
        uploadedImages.push(newImage);
        setUploadProgress({ total: validFiles.length, completed: i + 1 });
      } catch (err: any) {
        console.error(`Error uploading image ${validFiles[i].name}:`, err);
        uploadErrors.push(`שגיאה בהעלאת ${validFiles[i].name}`);
      }
    }

    // Update images state with newly uploaded images
    if (uploadedImages.length > 0) {
      setImages((prev) => {
        const combined = [...prev, ...uploadedImages];
        // Sort by order
        return combined.sort((a, b) => a.order - b.order);
      });
    }

    if (uploadErrors.length > 0) {
      setImagesError(uploadErrors.join('; '));
    }

    setIsUploading(false);
    setUploadProgress({ total: 0, completed: 0 });
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle image delete
  const handleImageDelete = async (image: YardCarImage) => {
    if (!window.confirm('למחוק את התמונה הזו?')) {
      return;
    }

    const auth = getAuth();
    if (!auth.currentUser || !currentCarId) {
      setImagesError('שגיאה במחיקת התמונה');
      return;
    }

    try {
      await deleteCarImage(auth.currentUser.uid, currentCarId, image);
      setImages((prev) => {
        const filtered = prev.filter((img) => img.id !== image.id);
        // Re-sort by order
        return filtered.sort((a, b) => a.order - b.order);
      });
    } catch (err: any) {
      console.error('Error deleting image:', err);
      setImagesError('שגיאה במחיקת התמונה');
    }
  };

  // Drag & drop handlers
  const handleDragStart = (e: React.DragEvent, image: YardCarImage) => {
    setDraggingImageId(image.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, targetImage: YardCarImage) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingImageId && draggingImageId !== targetImage.id) {
      setDragOverImageId(targetImage.id);
    }
  };

  const handleDragLeave = () => {
    setDragOverImageId(null);
  };

  const handleDrop = async (e: React.DragEvent, targetImage: YardCarImage) => {
    e.preventDefault();
    setDragOverImageId(null);

    if (!draggingImageId || draggingImageId === targetImage.id) {
      setDraggingImageId(null);
      return;
    }

    const auth = getAuth();
    if (!auth.currentUser || !currentCarId) {
      setDraggingImageId(null);
      return;
    }

    // Compute new order
    const draggedImage = images.find((img) => img.id === draggingImageId);
    if (!draggedImage) {
      setDraggingImageId(null);
      return;
    }

    const newImages = [...images];
    const draggedIndex = newImages.findIndex((img) => img.id === draggingImageId);
    const targetIndex = newImages.findIndex((img) => img.id === targetImage.id);

    // Remove dragged image from its position
    newImages.splice(draggedIndex, 1);
    // Insert at target position
    newImages.splice(targetIndex, 0, draggedImage);

    // Update local state immediately (optimistic update)
    setImages(newImages);
    setDraggingImageId(null);

    // Persist to Firestore
    try {
      await updateCarImagesOrder(auth.currentUser.uid, currentCarId, newImages);
      // Re-sort to ensure order is correct
      const normalized = newImages.map((img, index) => ({ ...img, order: index }));
      setImages(normalized);
    } catch (err: any) {
      console.error('Error updating images order:', err);
      setImagesError('שגיאה בשמירת סדר התמונות, נסה שוב');
      // Reload images to revert
      await loadImages(currentCarId);
    }
  };

  // Mark image as main (move to order 0)
  const handleMarkAsMain = async (image: YardCarImage) => {
    const auth = getAuth();
    if (!auth.currentUser || !currentCarId) {
      setImagesError('שגיאה בסימון התמונה הראשית');
      return;
    }

    // Compute new array with image at position 0
    const newImages = [...images];
    const imageIndex = newImages.findIndex((img) => img.id === image.id);
    
    if (imageIndex === 0) {
      // Already main
      return;
    }

    // Remove from current position
    newImages.splice(imageIndex, 1);
    // Insert at beginning
    newImages.unshift(image);

    // Update local state immediately
    setImages(newImages);

    // Persist to Firestore
    try {
      await updateCarImagesOrder(auth.currentUser.uid, currentCarId, newImages);
      // Re-sort to ensure order is correct
      const normalized = newImages.map((img, index) => ({ ...img, order: index }));
      setImages(normalized);
    } catch (err: any) {
      console.error('Error marking image as main:', err);
      setImagesError('שגיאה בסימון התמונה הראשית');
      // Reload images to revert
      await loadImages(currentCarId);
    }
  };

  // Lightbox handlers
  const handleLightboxOpen = (index: number) => {
    // If we have managed images, use the index directly
    // If we only have external images, the index is already correct
    setLightboxImageIndex(index);
  };

  const handleLightboxClose = () => {
    setLightboxImageIndex(null);
  };

  const handleLightboxPrev = () => {
    if (lightboxImageIndex !== null && lightboxImageIndex > 0) {
      setLightboxImageIndex(lightboxImageIndex - 1);
    }
  };

  const handleLightboxNext = () => {
    if (lightboxImageIndex !== null) {
      const totalImages = images.length > 0 ? images.length : externalImages.length;
      if (lightboxImageIndex < totalImages - 1) {
        setLightboxImageIndex(lightboxImageIndex + 1);
      }
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
        // Core fields
        brandId,
        brandText,
        modelId,
        modelText,
        year,
        price,
        mileageKm,
        city: city || undefined,
        
        // Identification fields
        licensePlatePartial: licensePlatePartial || undefined,
        vin: vin || undefined,
        stockNumber: stockNumber || undefined,
        
        // Technical fields
        gearboxType: gearboxType || undefined,
        fuelType: fuelType || undefined,
        bodyType: bodyType || undefined,
        engineDisplacementCc: engineDisplacementCc || undefined,
        horsepower: horsepower || undefined,
        numberOfGears: numberOfGears || undefined,
        color: color || undefined,
        
        // Ownership fields
        handCount: handCount || undefined,
        ownershipType: ownershipType || undefined,
        importType: importType || undefined,
        previousUse: previousUse || undefined,
        
        // Condition fields
        hasAccidents,
        hasAC,
        
        // Notes
        notes: notes || undefined,
      };

      const savedCarId = await saveYardCar(id || null, carData);
      
      // Update currentCarId if this was a new car
      if (!id) {
        setCurrentCarId(savedCarId);
        // Load images after first save
        await loadImages(savedCarId);
      }
      
      // Navigate back to fleet page
      navigate('/yard/fleet');
    } catch (err: any) {
      console.error('Error saving car:', err);
      setError(err.message || 'שגיאה בשמירת הרכב');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    navigate('/yard/fleet');
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
          {/* Basic Details Section */}
          <div className="form-section">
            <h2 className="section-title">פרטים בסיסיים</h2>

            <div className="form-row">
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
            </div>

            <div className="form-row">
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
            </div>

            <div className="form-row">
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
            </div>
          </div>

          {/* Identification Section */}
          <div className="form-section">
            <h2 className="section-title">זיהוי</h2>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">לוחית רישוי (ספרות אחרונות)</label>
                <input
                  type="text"
                  className="form-input"
                  value={licensePlatePartial}
                  onChange={(e) => setLicensePlatePartial(e.target.value)}
                  placeholder="למשל: 123-45"
                  maxLength={10}
                />
              </div>

              <div className="form-group">
                <label className="form-label">מספר מלאי פנימי</label>
                <input
                  type="text"
                  className="form-input"
                  value={stockNumber}
                  onChange={(e) => setStockNumber(e.target.value)}
                  placeholder="מספר פנימי"
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">מספר שלדה (VIN)</label>
              <input
                type="text"
                className="form-input"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                placeholder="מספר שלדה"
                maxLength={17}
              />
            </div>
          </div>

          {/* Technical Details Section */}
          <div className="form-section">
            <h2 className="section-title">פרטים טכניים</h2>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">תיבת הילוכים</label>
                <select
                  className="form-input form-select"
                  value={gearboxType}
                  onChange={(e) => setGearboxType(e.target.value)}
                >
                  <option value="">בחר...</option>
                  {Object.values(GearboxType).map((type) => (
                    <option key={type} value={type}>
                      {getGearboxTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">סוג דלק</label>
                <select
                  className="form-input form-select"
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value)}
                >
                  <option value="">בחר...</option>
                  {Object.values(FuelType).map((type) => (
                    <option key={type} value={type}>
                      {getFuelTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">סוג מרכב</label>
                <select
                  className="form-input form-select"
                  value={bodyType}
                  onChange={(e) => setBodyType(e.target.value)}
                >
                  <option value="">בחר...</option>
                  {Object.values(BodyType).map((type) => (
                    <option key={type} value={type}>
                      {getBodyTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">צבע</label>
                <input
                  type="text"
                  className="form-input"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="למשל: לבן"
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">נפח מנוע (סמ"ק)</label>
                <input
                  type="number"
                  className="form-input"
                  value={engineDisplacementCc}
                  onChange={(e) => setEngineDisplacementCc(e.target.value.replace(/\D/g, ''))}
                  placeholder="למשל: 1600"
                  min="0"
                />
              </div>

              <div className="form-group">
                <label className="form-label">כוח סוס (HP)</label>
                <input
                  type="number"
                  className="form-input"
                  value={horsepower}
                  onChange={(e) => setHorsepower(e.target.value.replace(/\D/g, ''))}
                  placeholder="למשל: 120"
                  min="0"
                />
              </div>
            </div>

            <div className="form-group form-group-half">
              <label className="form-label">מספר הילוכים</label>
              <input
                type="number"
                className="form-input"
                value={numberOfGears}
                onChange={(e) => setNumberOfGears(e.target.value.replace(/\D/g, ''))}
                placeholder="למשל: 6"
                min="1"
                max="12"
              />
            </div>
          </div>

          {/* Ownership Section */}
          <div className="form-section">
            <h2 className="section-title">בעלות וייבוא</h2>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">יד (בעלות)</label>
                <input
                  type="number"
                  className="form-input"
                  value={handCount}
                  onChange={(e) => setHandCount(e.target.value.replace(/\D/g, ''))}
                  placeholder="למשל: 2"
                  min="1"
                  max="10"
                />
              </div>

              <div className="form-group">
                <label className="form-label">סוג בעלות</label>
                <select
                  className="form-input form-select"
                  value={ownershipType}
                  onChange={(e) => setOwnershipType(e.target.value)}
                >
                  <option value="">בחר...</option>
                  <option value="private">פרטי</option>
                  <option value="lease">ליסינג</option>
                  <option value="company">חברה</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">סוג יבוא</label>
                <select
                  className="form-input form-select"
                  value={importType}
                  onChange={(e) => setImportType(e.target.value)}
                >
                  <option value="">בחר...</option>
                  <option value="official">יבוא רשמי</option>
                  <option value="parallel">יבוא מקביל</option>
                  <option value="personal">יבוא אישי</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">שימוש קודם</label>
                <select
                  className="form-input form-select"
                  value={previousUse}
                  onChange={(e) => setPreviousUse(e.target.value)}
                >
                  <option value="">בחר...</option>
                  <option value="private">פרטי</option>
                  <option value="rental">השכרה</option>
                  <option value="taxi">מונית</option>
                  <option value="lease">ליסינג</option>
                  <option value="driving_school">לימוד נהיגה</option>
                </select>
              </div>
            </div>
          </div>

          {/* Condition Section */}
          <div className="form-section">
            <h2 className="section-title">מצב ותוספות</h2>

            <div className="form-row form-checkboxes">
              <div className="form-group form-checkbox-group">
                <label className="form-checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasAC === true}
                    onChange={(e) => setHasAC(e.target.checked ? true : undefined)}
                  />
                  <span>מזגן</span>
                </label>
              </div>

              <div className="form-group form-checkbox-group">
                <label className="form-checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasAccidents === true}
                    onChange={(e) => setHasAccidents(e.target.checked ? true : undefined)}
                  />
                  <span>היה מעורב בתאונה</span>
                </label>
              </div>
            </div>
          </div>

          {/* Notes Section */}
          <div className="form-section">
            <h2 className="section-title">הערות ומידע נוסף</h2>

            <div className="form-group">
              <label className="form-label">הערות</label>
              <textarea
                className="form-input form-textarea"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הערות נוספות על הרכב, אביזרים מיוחדים, היסטוריה..."
                rows={4}
              />
            </div>
          </div>

          {/* Images Section */}
          <div className="form-section">
            <h2 className="section-title">תמונות הרכב</h2>

            {!currentCarId ? (
              <div className="images-info-message">
                <p>לא ניתן להעלות תמונות לפני שמירת הרכב בפעם הראשונה.</p>
              </div>
            ) : (
              <>
                <div className="images-upload-bar">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageUpload}
                    disabled={isUploading}
                    style={{ display: 'none' }}
                    id="image-upload-input"
                  />
                  <label htmlFor="image-upload-input" className="btn btn-secondary">
                    {isUploading 
                      ? `מעלה תמונות... (${uploadProgress.completed}/${uploadProgress.total})` 
                      : 'העלה תמונות'}
                  </label>
                </div>

                {imagesError && (
                  <div className="images-error-message">
                    {imagesError}
                  </div>
                )}

                {imagesLoading ? (
                  <div className="images-loading">
                    <p>טוען תמונות...</p>
                  </div>
                ) : images.length === 0 && externalImages.length === 0 ? (
                  <div className="images-empty">
                    <p>אין תמונות עדיין</p>
                  </div>
                ) : (
                  <>
                  {/* External images (read-only) - show if no managed images */}
                  {images.length === 0 && externalImages.length > 0 && (
                    <div className="external-images-section">
                      <p className="external-images-label" style={{ marginBottom: '1rem', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                        תמונות קיימות מהפרסום
                      </p>
                      <div className="images-gallery">
                        {externalImages.map((url, index) => (
                          <div key={`external-${index}`} className="image-thumbnail-wrapper" style={{ position: 'relative' }}>
                            <img
                              src={url}
                              alt={`תמונה ${index + 1}`}
                              className="image-thumbnail"
                              onClick={() => {
                                // Open in lightbox - use external images directly
                                setLightboxImageIndex(index);
                              }}
                            />
                            <div className="image-readonly-badge" style={{
                              position: 'absolute',
                              top: '0.5rem',
                              right: '0.5rem',
                              background: 'rgba(0,0,0,0.6)',
                              color: 'white',
                              padding: '0.25rem 0.5rem',
                              borderRadius: '0.25rem',
                              fontSize: '0.75rem',
                            }}>
                              לקריאה בלבד
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Managed images (editable) */}
                  {images.length > 0 && (
                  <div className="images-gallery">
                    {images.map((image, index) => (
                      <div
                        key={image.id}
                        className={`image-thumbnail-wrapper ${
                          draggingImageId === image.id ? 'dragging' : ''
                        } ${dragOverImageId === image.id ? 'drag-over' : ''}`}
                        draggable={true}
                        onDragStart={(e) => handleDragStart(e, image)}
                        onDragOver={(e) => handleDragOver(e, image)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, image)}
                      >
                        {image.order === 0 && (
                          <div className="image-main-badge">תמונה ראשית</div>
                        )}
                        <img
                          src={image.originalUrl}
                          alt={`תמונה ${image.order + 1}`}
                          className="image-thumbnail"
                          onClick={() => handleLightboxOpen(index)}
                        />
                        <div className="image-actions">
                          {image.order !== 0 && (
                            <button
                              type="button"
                              className="image-mark-main-btn"
                              onClick={() => handleMarkAsMain(image)}
                              title="סמן כראשית"
                            >
                              ראשית
                            </button>
                          )}
                          <button
                            type="button"
                            className="image-delete-btn"
                            onClick={() => handleImageDelete(image)}
                            title="מחק תמונה"
                          >
                            מחק
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  )}
                  </>
                )}
              </>
            )}
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

        {/* Lightbox */}
        {lightboxImageIndex !== null && (images.length > 0 || externalImages.length > 0) && (
          <div className="image-lightbox-overlay" onClick={handleLightboxClose}>
            <div className="image-lightbox-content" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="image-lightbox-close"
                onClick={handleLightboxClose}
                aria-label="סגור"
              >
                ×
              </button>
              {(() => {
                // Use managed images if available, otherwise use external images
                const displayImages = images.length > 0 
                  ? images 
                  : externalImages.map((url, i) => ({
                      id: `external-${i}`,
                      originalUrl: url,
                      thumbUrl: null,
                      order: i,
                    }));
                const totalImages = displayImages.length;
                if (lightboxImageIndex === null || lightboxImageIndex >= totalImages) {
                  return null;
                }
                const currentImage = displayImages[lightboxImageIndex];
                const imageUrl = typeof currentImage === 'string' 
                  ? currentImage 
                  : (currentImage.originalUrl || currentImage.thumbUrl || '');
                return (
                  <>
                    <img
                      src={imageUrl}
                      alt={`תמונה ${lightboxImageIndex + 1}`}
                      className="image-lightbox-image"
                    />
                    <div className="image-lightbox-nav">
                      <button
                        type="button"
                        className="image-lightbox-nav-btn"
                        onClick={handleLightboxPrev}
                        disabled={lightboxImageIndex === 0}
                        aria-label="תמונה קודמת"
                      >
                        ←
                      </button>
                      <span className="image-lightbox-counter">
                        {lightboxImageIndex + 1} / {totalImages}
                      </span>
                      <button
                        type="button"
                        className="image-lightbox-nav-btn"
                        onClick={handleLightboxNext}
                        disabled={lightboxImageIndex === totalImages - 1}
                        aria-label="תמונה הבאה"
                      >
                        →
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

