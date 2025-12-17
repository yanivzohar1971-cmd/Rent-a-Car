import { useState, useEffect } from 'react';
import './FavoriteHeart.css';

export interface FavoriteHeartProps {
  isFavorite: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function FavoriteHeart({ isFavorite, onToggle, disabled = false }: FavoriteHeartProps) {
  const [showSavedBadge, setShowSavedBadge] = useState(false);
  const [showRemovedBadge, setShowRemovedBadge] = useState(false);

  useEffect(() => {
    if (showSavedBadge) {
      const timer = setTimeout(() => setShowSavedBadge(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showSavedBadge]);

  useEffect(() => {
    if (showRemovedBadge) {
      const timer = setTimeout(() => setShowRemovedBadge(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showRemovedBadge]);

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;

    const wasFavorite = isFavorite;
    onToggle();

    // Show appropriate badge
    if (!wasFavorite) {
      setShowSavedBadge(true);
      setShowRemovedBadge(false);
    } else {
      setShowRemovedBadge(true);
      setShowSavedBadge(false);
    }
  };

  return (
    <div className="favorite-heart-container">
      <button
        type="button"
        className={`favorite-heart ${isFavorite ? 'favorite' : ''} ${disabled ? 'disabled' : ''}`}
        onClick={handleClick}
        disabled={disabled}
        aria-label={isFavorite ? 'הסר ממועדפים' : 'הוסף למועדפים'}
      >
        <span className="heart-icon">{isFavorite ? '❤️' : '🤍'}</span>
      </button>
      {showSavedBadge && (
        <div className="favorite-badge saved-badge">
          המודעה נשמרה
        </div>
      )}
      {showRemovedBadge && (
        <div className="favorite-badge removed-badge">
          המודעה הוסרה
        </div>
      )}
    </div>
  );
}

