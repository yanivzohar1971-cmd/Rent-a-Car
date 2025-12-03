import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchAllPromotionProducts,
  createPromotionProduct,
  updatePromotionProduct,
  type PromotionProduct,
} from '../api/promotionApi';
import type { PromotionScope, PromotionProductType } from '../types/Promotion';
import './AdminPromotionProductsPage.css';

type TabType = 'PRIVATE_SELLER_AD' | 'YARD_CAR' | 'YARD_BRAND';

export default function AdminPromotionProductsPage() {
  const { firebaseUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('PRIVATE_SELLER_AD');
  const [products, setProducts] = useState<PromotionProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingProduct, setEditingProduct] = useState<PromotionProduct | null>(null);
  const [showForm, setShowForm] = useState(false);

  const isAdmin = userProfile?.isAdmin === true;

  useEffect(() => {
    if (!firebaseUser || !isAdmin) {
      navigate('/account');
    }
  }, [firebaseUser, isAdmin, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    loadProducts();
  }, [isAdmin, activeTab]);

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      const allProducts = await fetchAllPromotionProducts();
      setProducts(allProducts.filter((p) => p.scope === activeTab));
    } catch (err: any) {
      console.error('Error loading promotion products:', err);
      setError('שגיאה בטעינת מוצרי קידום');
    } finally {
      setLoading(false);
    }
  }

  const handleSave = async (productData: Omit<PromotionProduct, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
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
      setError(err.message || 'שגיאה בשמירת מוצר');
    }
  };

  const handleToggleActive = async (product: PromotionProduct) => {
    try {
      await updatePromotionProduct(product.id, { isActive: !product.isActive });
      await loadProducts();
    } catch (err: any) {
      console.error('Error toggling product:', err);
      setError('שגיאה בעדכון מוצר');
    }
  };

  const scopeLabels: Record<PromotionScope, string> = {
    PRIVATE_SELLER_AD: 'קידום מוכרים פרטיים',
    YARD_CAR: 'קידום רכבי מגרש',
    YARD_BRAND: 'קידום מגרש',
  };

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
              onClick={() => setActiveTab(scope as TabType)}
            >
              {scopeLabels[scope]}
            </button>
          ))}
        </div>

        <div className="actions-bar">
          <button
            className="btn btn-primary"
            onClick={() => {
              setEditingProduct(null);
              setShowForm(true);
            }}
          >
            יצירת מוצר חדש
          </button>
        </div>

        {loading ? (
          <p>טוען...</p>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <p>אין מוצרי קידום זמינים</p>
          </div>
        ) : (
          <table className="products-table">
            <thead>
              <tr>
                <th>שם</th>
                <th>סוג</th>
                <th>מחיר</th>
                <th>משך (ימים)</th>
                <th>פעיל</th>
                <th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td>{product.name}</td>
                  <td>{product.type}</td>
                  <td>{product.price} {product.currency}</td>
                  <td>{product.durationDays || '-'}</td>
                  <td>
                    <span className={product.isActive ? 'status-active' : 'status-inactive'}>
                      {product.isActive ? 'כן' : 'לא'}
                    </span>
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn btn-small btn-secondary"
                        onClick={() => {
                          setEditingProduct(product);
                          setShowForm(true);
                        }}
                      >
                        ערוך
                      </button>
                      <button
                        className="btn btn-small"
                        onClick={() => handleToggleActive(product)}
                      >
                        {product.isActive ? 'השבת' : 'הפעל'}
                      </button>
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
            onSave={handleSave}
            onCancel={() => {
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
  onSave: (data: Omit<PromotionProduct, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

function ProductForm({ product, scope, onSave, onCancel }: ProductFormProps) {
  const [name, setName] = useState(product?.name || '');
  const [type, setType] = useState<PromotionProductType>(product?.type || 'BOOST');
  const [description, setDescription] = useState(product?.description || '');
  const [price, setPrice] = useState(product?.price?.toString() || '0');
  const [currency, setCurrency] = useState(product?.currency || 'ILS');
  const [durationDays, setDurationDays] = useState(product?.durationDays?.toString() || '');
  const [numBumps, setNumBumps] = useState(product?.numBumps?.toString() || '');
  const [isActive, setIsActive] = useState(product?.isActive ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      type,
      scope,
      name,
      description: description || undefined,
      price: parseFloat(price),
      currency,
      durationDays: durationDays ? parseInt(durationDays, 10) : undefined,
      numBumps: numBumps ? parseInt(numBumps, 10) : undefined,
      isActive,
    });
  };

  return (
    <div className="product-form-overlay">
      <div className="product-form">
        <h2>{product ? 'עריכת מוצר' : 'מוצר חדש'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>שם *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>סוג *</label>
            <select value={type} onChange={(e) => setType(e.target.value as PromotionProductType)} required>
              <option value="BOOST">BOOST</option>
              <option value="HIGHLIGHT">HIGHLIGHT</option>
              <option value="MEDIA_PLUS">MEDIA_PLUS</option>
              <option value="EXPOSURE_PLUS">EXPOSURE_PLUS</option>
              <option value="BUNDLE">BUNDLE</option>
            </select>
          </div>
          <div className="form-group">
            <label>תיאור</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>מחיר *</label>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} required min="0" />
            </div>
            <div className="form-group">
              <label>מטבע *</label>
              <input type="text" value={currency} onChange={(e) => setCurrency(e.target.value)} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>משך (ימים)</label>
              <input type="number" value={durationDays} onChange={(e) => setDurationDays(e.target.value)} min="1" />
            </div>
            <div className="form-group">
              <label>מספר הקפצות</label>
              <input type="number" value={numBumps} onChange={(e) => setNumBumps(e.target.value)} min="0" />
            </div>
          </div>
          <div className="form-group">
            <label>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              פעיל
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

