import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchAllPromotionProducts,
  createPromotionProduct,
  updatePromotionProduct,
  archivePromotionProduct,
  togglePromotionProductActive,
} from '../api/promotionApi';
import type { PromotionProduct, PromotionScope, PromotionProductType } from '../types/Promotion';
import { getPromotionTypeLabel } from '../utils/promotionLabels';
import './AdminPromotionProductsPage.css';

// All available promotion product types (in order for dropdown)
const PRODUCT_TYPE_OPTIONS: PromotionProductType[] = [
  'BOOST',
  'HIGHLIGHT',
  'MEDIA_PLUS',
  'EXPOSURE_PLUS',
  'BUNDLE',
  'PLATINUM',
  'DIAMOND',
];

type TabType = 'PRIVATE_SELLER_AD' | 'YARD_CAR' | 'YARD_BRAND';
type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export default function AdminPromotionProductsPage() {
  const { firebaseUser, userProfile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('PRIVATE_SELLER_AD');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [allProducts, setAllProducts] = useState<PromotionProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<PromotionProduct | null>(null);
  const [showForm, setShowForm] = useState(false);

  const isAdmin = userProfile?.isAdmin === true;

  useEffect(() => {
    if (authLoading) return; // Wait for auth/profile to load
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [authLoading, firebaseUser, isAdmin, navigate]);

  useEffect(() => {
    if (authLoading || !isAdmin) return;
    loadProducts();
  }, [authLoading, isAdmin]);

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      const loaded = await fetchAllPromotionProducts();
      setAllProducts(loaded);
    } catch (err: any) {
      console.error('AdminPromotionProductsPage load error:', err);
      console.error('Error code:', err?.code);
      console.error('Error message:', err?.message);
      console.error('Full error:', JSON.stringify(err, null, 2));
      const errorMessage = err?.code === 'permission-denied' 
        ? 'אין הרשאה לטעון מוצרי קידום. ודא שהמשתמש שלך מסומן כמנהל במערכת.'
        : err?.message || 'שגיאה בטעינת מוצרי קידום';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }

  // Filter products based on active tab and status filter
  const products = allProducts.filter((p) => {
    if (p.scope !== activeTab) return false;
    if (statusFilter === 'ARCHIVED') return p.isArchived === true;
    if (statusFilter === 'ACTIVE') return p.isActive === true && !p.isArchived;
    if (statusFilter === 'INACTIVE') return p.isActive === false && !p.isArchived;
    return true; // ALL
  });

  const handleSave = async (productData: Omit<PromotionProduct, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      setError(null);
      setFormError(null);
      if (editingProduct) {
        await updatePromotionProduct(editingProduct.id, productData);
      } else {
        await createPromotionProduct(productData);
      }
      setShowForm(false);
      setEditingProduct(null);
      await loadProducts();
    } catch (err: any) {
      console.error('Error saving product:', err);
      const msg = err?.code === 'permission-denied'
        ? 'אין הרשאה לשמור מוצר קידום. ודא שלמשתמש יש הרשאות מנהל.'
        : err?.message || 'אירעה שגיאה בשמירת מוצר הקידום.';
      setError(msg);
      setFormError(msg);
    }
  };

  const handleToggleActive = async (product: PromotionProduct) => {
    try {
      setError(null);
      await togglePromotionProductActive(product.id, !product.isActive);
      await loadProducts();
    } catch (err: any) {
      console.error('Error toggling product:', err);
      setError('שגיאה בעדכון מוצר');
    }
  };

  const handleArchive = async (product: PromotionProduct) => {
    if (!confirm('האם אתה בטוח שברצונך לארכב מבצע זה? המבצע לא יוצג עוד במערכת.')) {
      return;
    }
    try {
      setError(null);
      await archivePromotionProduct(product.id);
      await loadProducts();
    } catch (err: any) {
      console.error('Error archiving product:', err);
      setError('שגיאה בארכוב מבצע');
    }
  };

  const scopeLabels: Record<PromotionScope, string> = {
    PRIVATE_SELLER_AD: 'קידום מוכרים פרטיים',
    YARD_CAR: 'קידום רכבי מגרש',
    YARD_BRAND: 'קידום מגרש',
  };

  // Show loading while auth is being checked
  if (authLoading) {
    return (
      <div className="admin-promotion-products-page">
        <div className="page-container">
          <div className="loading-state">
            <p>בודק הרשאות...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <div className="admin-promotion-products-page">
      <div className="page-container">
        <div className="page-header">
          <h1>ניהול מוצרי קידום</h1>
          <button className="btn btn-secondary" onClick={() => navigate('/account')}>
            חזרה
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="tabs">
          {(Object.keys(scopeLabels) as PromotionScope[]).map((scope) => (
            <button
              key={scope}
              className={`tab ${activeTab === scope ? 'active' : ''}`}
              onClick={() => {
                setError(null);
                setActiveTab(scope as TabType);
              }}
            >
              {scopeLabels[scope]}
            </button>
          ))}
        </div>

        <div className="actions-bar">
          <button
            className="btn btn-primary"
            onClick={() => {
              setError(null);
              setEditingProduct(null);
              setShowForm(true);
            }}
          >
            + הוספת מבצע חדש
          </button>
        </div>

        {/* Status Filter */}
        <div className="status-filters">
          <button
            className={`filter-btn ${statusFilter === 'ALL' ? 'active' : ''}`}
            onClick={() => {
              setError(null);
              setStatusFilter('ALL');
            }}
          >
            הכל
          </button>
          <button
            className={`filter-btn ${statusFilter === 'ACTIVE' ? 'active' : ''}`}
            onClick={() => {
              setError(null);
              setStatusFilter('ACTIVE');
            }}
          >
            פעילים
          </button>
          <button
            className={`filter-btn ${statusFilter === 'INACTIVE' ? 'active' : ''}`}
            onClick={() => {
              setError(null);
              setStatusFilter('INACTIVE');
            }}
          >
            לא פעילים
          </button>
          <button
            className={`filter-btn ${statusFilter === 'ARCHIVED' ? 'active' : ''}`}
            onClick={() => {
              setError(null);
              setStatusFilter('ARCHIVED');
            }}
          >
            בארכיון
          </button>
        </div>

        {loading ? (
          <div className="loading-state">
            <p>טוען מוצרי קידום...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <p>אין מוצרי קידום זמינים</p>
          </div>
        ) : (
          <table className="products-table">
            <thead>
              <tr>
                <th>קוד</th>
                <th>שם עברי</th>
                <th>סוג</th>
                <th>מחיר (₪)</th>
                <th>משך (ימים)</th>
                <th>מיקום</th>
                <th>סטטוס</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className={product.isArchived ? 'archived-row' : ''}>
                  <td>{product.code || '-'}</td>
                  <td>
                    <strong>{product.labelHe || product.name}</strong>
                    {product.isFeatured && <span className="featured-badge">⭐ מומלץ</span>}
                  </td>
                  <td>{product.type}</td>
                  <td>{(product.priceIls || product.price).toLocaleString()} {product.currency}</td>
                  <td>{product.durationDays || '-'}</td>
                  <td>{product.sortOrder !== undefined ? product.sortOrder : '-'}</td>
                  <td>
                    {product.isArchived ? (
                      <span className="status-archived">בארכיון</span>
                    ) : (
                      <span className={product.isActive ? 'status-active' : 'status-inactive'}>
                        {product.isActive ? 'פעיל' : 'לא פעיל'}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn btn-small btn-secondary"
                        onClick={() => {
                          setError(null);
                          setEditingProduct(product);
                          setShowForm(true);
                        }}
                        disabled={product.isArchived}
                      >
                        ערוך
                      </button>
                      {!product.isArchived && (
                        <button
                          className="btn btn-small"
                          onClick={() => handleToggleActive(product)}
                        >
                          {product.isActive ? 'השבת' : 'הפעל'}
                        </button>
                      )}
                      {!product.isArchived && (
                        <button
                          className="btn btn-small btn-warning"
                          onClick={() => handleArchive(product)}
                        >
                          ארכוב
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {showForm && (
          <ProductForm
            product={editingProduct}
            scope={activeTab}
            formError={formError}
            onSave={handleSave}
            onCancel={() => {
              setError(null);
              setFormError(null);
              setShowForm(false);
              setEditingProduct(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

interface ProductFormProps {
  product: PromotionProduct | null;
  scope: PromotionScope;
  formError?: string | null;
  onSave: (data: Omit<PromotionProduct, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

function ProductForm({ product, scope, formError, onSave, onCancel }: ProductFormProps) {
  const [code, setCode] = useState(product?.code || '');
  const [labelHe, setLabelHe] = useState(product?.labelHe || product?.name || '');
  const [labelEn, setLabelEn] = useState(product?.labelEn || '');
  const [descriptionHe, setDescriptionHe] = useState(product?.descriptionHe || product?.description || '');
  const [descriptionEn, setDescriptionEn] = useState(product?.descriptionEn || '');
  const [type, setType] = useState<PromotionProductType>(product?.type || 'BOOST');
  const [priceIls, setPriceIls] = useState((product?.priceIls || product?.price || 0).toString());
  const [currency, setCurrency] = useState(product?.currency || 'ILS');
  const [durationDays, setDurationDays] = useState(product?.durationDays?.toString() || '');
  const [numBumps, setNumBumps] = useState(product?.numBumps?.toString() || '');
  const [maxCarsPerOrder, setMaxCarsPerOrder] = useState(product?.maxCarsPerOrder?.toString() || '');
  const [highlightLevel, setHighlightLevel] = useState(product?.highlightLevel?.toString() || '');
  const [isFeatured, setIsFeatured] = useState(product?.isFeatured ?? false);
  const [sortOrder, setSortOrder] = useState(product?.sortOrder?.toString() || '100');
  const [isActive, setIsActive] = useState(product?.isActive ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Use labelHe as name for backward compatibility
    const name = labelHe || code;
    
    // Build payload object
    const payload: any = {
      type,
      scope,
      name, // Legacy field
      price: parseFloat(priceIls), // Legacy field
      currency,
      isActive,
      priceIls: parseFloat(priceIls),
      isFeatured,
      sortOrder: sortOrder ? parseInt(sortOrder, 10) : 100,
    };

    // Only add optional fields if they have values (not empty strings)
    if (descriptionHe && descriptionHe.trim()) {
      payload.description = descriptionHe; // Legacy field
      payload.descriptionHe = descriptionHe;
    }
    if (durationDays && durationDays.trim()) {
      payload.durationDays = parseInt(durationDays, 10);
    }
    if (numBumps && numBumps.trim()) {
      payload.numBumps = parseInt(numBumps, 10);
    }
    if (code && code.trim()) {
      payload.code = code;
    }
    if (labelHe && labelHe.trim()) {
      payload.labelHe = labelHe;
    }
    if (labelEn && labelEn.trim()) {
      payload.labelEn = labelEn;
    }
    if (descriptionEn && descriptionEn.trim()) {
      payload.descriptionEn = descriptionEn;
    }
    if (maxCarsPerOrder && maxCarsPerOrder.trim()) {
      payload.maxCarsPerOrder = parseInt(maxCarsPerOrder, 10);
    } else {
      payload.maxCarsPerOrder = null; // Explicit null is OK for Firestore
    }
    if (highlightLevel && highlightLevel.trim()) {
      payload.highlightLevel = parseInt(highlightLevel, 10);
    }

    // Remove any undefined values (Firestore doesn't allow undefined)
    Object.keys(payload).forEach((key) => {
      if (payload[key] === undefined) {
        delete payload[key];
      }
    });
    
    onSave(payload);
  };

  return (
    <div className="product-form-overlay">
      <div className="product-form">
        <h2>{product ? 'עריכת מבצע' : 'מבצע חדש'}</h2>
        {formError && (
          <div className="form-error-banner">
            {formError}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>קוד פנימי</label>
            <input 
              type="text" 
              value={code} 
              onChange={(e) => setCode(e.target.value)} 
              placeholder="לדוגמה: CAR_BOOST_7DAYS"
            />
            <small>קוד ייחודי לזיהוי המבצע במערכת</small>
          </div>
          
          <div className="form-group">
            <label>שם עברי *</label>
            <input 
              type="text" 
              value={labelHe} 
              onChange={(e) => setLabelHe(e.target.value)} 
              required 
              placeholder="לדוגמה: הקפצת רכב ל-7 ימים"
            />
          </div>
          
          <div className="form-group">
            <label>שם באנגלית</label>
            <input 
              type="text" 
              value={labelEn} 
              onChange={(e) => setLabelEn(e.target.value)} 
              placeholder="For future use"
            />
          </div>
          
          <div className="form-group">
            <label>תיאור בעברית</label>
            <textarea 
              value={descriptionHe} 
              onChange={(e) => setDescriptionHe(e.target.value)} 
              rows={3}
              placeholder="תיאור המבצע בעברית"
            />
          </div>
          
          <div className="form-group">
            <label>תיאור באנגלית</label>
            <textarea 
              value={descriptionEn} 
              onChange={(e) => setDescriptionEn(e.target.value)} 
              rows={3}
              placeholder="Description in English"
            />
          </div>
          
          <div className="form-group">
            <label>סוג מבצע *</label>
            <select value={type} onChange={(e) => setType(e.target.value as PromotionProductType)} required>
              {PRODUCT_TYPE_OPTIONS.map((productType) => (
                <option key={productType} value={productType}>
                  {productType} - {getPromotionTypeLabel(productType)}
                </option>
              ))}
            </select>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>מחיר (₪) *</label>
              <input 
                type="number" 
                value={priceIls} 
                onChange={(e) => setPriceIls(e.target.value)} 
                required 
                min="0" 
                step="0.01"
              />
            </div>
            <div className="form-group">
              <label>מטבע *</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} required>
                <option value="ILS">ILS (₪)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>משך (ימים)</label>
              <input 
                type="number" 
                value={durationDays} 
                onChange={(e) => setDurationDays(e.target.value)} 
                min="1" 
                placeholder="למשל: 7"
              />
            </div>
            <div className="form-group">
              <label>מספר הקפצות</label>
              <input 
                type="number" 
                value={numBumps} 
                onChange={(e) => setNumBumps(e.target.value)} 
                min="0"
              />
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>מספר רכבים מקסימלי בהזמנה</label>
              <input 
                type="number" 
                value={maxCarsPerOrder} 
                onChange={(e) => setMaxCarsPerOrder(e.target.value)} 
                min="0"
                placeholder="ריק = ללא הגבלה"
              />
            </div>
            <div className="form-group">
              <label>רמת הדגשה (1-3)</label>
              <select 
                value={highlightLevel} 
                onChange={(e) => setHighlightLevel(e.target.value)}
              >
                <option value="">ללא</option>
                <option value="1">1 - נמוכה</option>
                <option value="2">2 - בינונית</option>
                <option value="3">3 - גבוהה</option>
              </select>
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>מיקום בסדר הצגה</label>
              <input 
                type="number" 
                value={sortOrder} 
                onChange={(e) => setSortOrder(e.target.value)} 
                min="0"
              />
              <small>מספר נמוך יותר = מופיע קודם</small>
            </div>
          </div>
          
          <div className="form-group">
            <label>
              <input 
                type="checkbox" 
                checked={isFeatured} 
                onChange={(e) => setIsFeatured(e.target.checked)} 
              />
              {' '}מוצג כמומלץ (Featured)
            </label>
          </div>
          
          <div className="form-group">
            <label>
              <input 
                type="checkbox" 
                checked={isActive} 
                onChange={(e) => setIsActive(e.target.checked)} 
              />
              {' '}פעיל
            </label>
          </div>
          
          <div className="form-actions">
            <button type="button" className="btn btn-secondary" onClick={onCancel}>
              ביטול
            </button>
            <button type="submit" className="btn btn-primary">
              שמור
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

