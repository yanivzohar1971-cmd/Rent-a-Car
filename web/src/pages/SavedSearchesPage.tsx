import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  fetchSavedSearches,
  updateSavedSearch,
  deleteSavedSearch,
  type SavedSearch,
} from '../api/savedSearchesApi';
import './SavedSearchesPage.css';

export default function SavedSearchesPage() {
  const { firebaseUser } = useAuth();
  const navigate = useNavigate();
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!firebaseUser) {
      navigate('/account');
      return;
    }
  }, [firebaseUser, navigate]);

  // Load saved searches
  useEffect(() => {
    async function load() {
      if (!firebaseUser) return;
      
      setIsLoading(true);
      setError(null);
      try {
        const searches = await fetchSavedSearches(firebaseUser.uid);
        setSavedSearches(searches);
      } catch (err: any) {
        console.error('Error loading saved searches:', err);
        setError('שגיאה בטעינת החיפושים השמורים');
      } finally {
        setIsLoading(false);
      }
    }
    
    load();
  }, [firebaseUser]);

  const handleToggleActive = async (search: SavedSearch) => {
    if (!firebaseUser) return;
    
    setIsSaving(true);
    setError(null);
    try {
      await updateSavedSearch(firebaseUser.uid, search.id, {
        active: !search.active,
      });
      setSavedSearches((prev) =>
        prev.map((s) => (s.id === search.id ? { ...s, active: !s.active } : s))
      );
    } catch (err: any) {
      console.error('Error updating saved search:', err);
      setError('שגיאה בעדכון החיפוש');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStartEdit = (search: SavedSearch) => {
    setEditingId(search.id);
    setEditingLabel(search.label);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingLabel('');
  };

  const handleSaveEdit = async (searchId: string) => {
    if (!firebaseUser) return;
    
    setIsSaving(true);
    setError(null);
    try {
      await updateSavedSearch(firebaseUser.uid, searchId, {
        label: editingLabel.trim(),
      });
      setSavedSearches((prev) =>
        prev.map((s) => (s.id === searchId ? { ...s, label: editingLabel.trim() } : s))
      );
      setEditingId(null);
      setEditingLabel('');
    } catch (err: any) {
      console.error('Error updating saved search label:', err);
      setError('שגיאה בעדכון שם החיפוש');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (search: SavedSearch) => {
    if (!window.confirm(`האם למחוק את החיפוש "${search.label}"?`)) {
      return;
    }

    if (!firebaseUser) return;
    
    setIsSaving(true);
    setError(null);
    try {
      await deleteSavedSearch(firebaseUser.uid, search.id);
      setSavedSearches((prev) => prev.filter((s) => s.id !== search.id));
    } catch (err: any) {
      console.error('Error deleting saved search:', err);
      setError('שגיאה במחיקת החיפוש');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTimestamp = (timestamp: any): string => {
    if (!timestamp) return '-';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return new Intl.DateTimeFormat('he-IL', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return '-';
    }
  };

  const getFiltersSummary = (filters: any): string => {
    const parts: string[] = [];
    if (filters.manufacturer) parts.push(`יצרן: ${filters.manufacturer}`);
    if (filters.model) parts.push(`דגם: ${filters.model}`);
    if (filters.yearFrom || filters.yearTo) {
      const yearRange = [filters.yearFrom, filters.yearTo].filter(Boolean).join('-');
      parts.push(`שנה: ${yearRange}`);
    }
    if (filters.priceFrom || filters.priceTo) {
      const priceRange = [
        filters.priceFrom ? filters.priceFrom.toLocaleString('he-IL') : '',
        filters.priceTo ? filters.priceTo.toLocaleString('he-IL') : '',
      ]
        .filter(Boolean)
        .join('-');
      parts.push(`מחיר: ${priceRange} ₪`);
    }
    return parts.length > 0 ? parts.join(', ') : 'ללא סינון';
  };

  if (isLoading) {
    return (
      <div className="saved-searches-page">
        <div className="loading-container">
          <p>טוען חיפושים שמורים...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="saved-searches-page">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">חיפושים שמורים / התראות</h1>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => navigate('/account')}
          >
            חזרה לאזור האישי
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {savedSearches.length === 0 ? (
          <div className="empty-state">
            <p>אין חיפושים שמורים</p>
            <p className="empty-state-subtitle">
              שמור חיפושים מהדף חיפוש רכבים כדי לקבל התראות על רכבים חדשים
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate('/cars')}
            >
              חיפוש רכבים
            </button>
          </div>
        ) : (
          <div className="saved-searches-list">
            {savedSearches.map((search) => (
              <div key={search.id} className="saved-search-card">
                <div className="search-card-header">
                  {editingId === search.id ? (
                    <div className="edit-label-form">
                      <input
                        type="text"
                        className="edit-label-input"
                        value={editingLabel}
                        onChange={(e) => setEditingLabel(e.target.value)}
                        placeholder="שם החיפוש"
                        dir="rtl"
                      />
                      <div className="edit-label-actions">
                        <button
                          type="button"
                          className="btn btn-sm btn-primary"
                          onClick={() => handleSaveEdit(search.id)}
                          disabled={isSaving || !editingLabel.trim()}
                        >
                          שמור
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-secondary"
                          onClick={handleCancelEdit}
                          disabled={isSaving}
                        >
                          ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    <h3 className="search-label">{search.label}</h3>
                  )}
                  <div className="search-status">
                    <span className={`status-badge ${search.active ? 'active' : 'inactive'}`}>
                      {search.active ? 'פעיל' : 'מושהה'}
                    </span>
                  </div>
                </div>

                <div className="search-card-body">
                  <p className="search-filters-summary">
                    <strong>סינונים:</strong> {getFiltersSummary(search.filters)}
                  </p>
                  <p className="search-meta">
                    נוצר: {formatTimestamp(search.createdAt)}
                  </p>
                  {search.lastNotifiedAt && (
                    <p className="search-meta">
                      התראה אחרונה: {formatTimestamp(search.lastNotifiedAt)}
                    </p>
                  )}
                </div>

                <div className="search-card-actions">
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => handleToggleActive(search)}
                    disabled={isSaving}
                  >
                    {search.active ? 'השהה התראות' : 'הפעל התראות'}
                  </button>
                  {editingId !== search.id && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => handleStartEdit(search)}
                      disabled={isSaving}
                    >
                      שנה שם
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(search)}
                    disabled={isSaving}
                  >
                    מחק
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

