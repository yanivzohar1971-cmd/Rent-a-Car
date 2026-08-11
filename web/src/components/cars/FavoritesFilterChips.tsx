import './FavoritesFilterChips.css';

export type FavoritesFilter = 'all' | 'only_favorites' | 'without_favorites';

export interface FavoritesFilterChipsProps {
  filter: FavoritesFilter;
  onFilterChange: (filter: FavoritesFilter) => void;
}

export function FavoritesFilterChips({ filter, onFilterChange }: FavoritesFilterChipsProps) {
  return (
    <div className="favorites-filter-chips" dir="rtl">
      <button
        type="button"
        className={`favorites-chip ${filter === 'all' ? 'active' : ''}`}
        onClick={() => onFilterChange('all')}
      >
        הכל
      </button>
      <button
        type="button"
        className={`favorites-chip ${filter === 'only_favorites' ? 'active' : ''}`}
        onClick={() => onFilterChange('only_favorites')}
      >
        מועדפים בלבד
      </button>
      <button
        type="button"
        className={`favorites-chip ${filter === 'without_favorites' ? 'active' : ''}`}
        onClick={() => onFilterChange('without_favorites')}
      >
        ללא מועדפים
      </button>
    </div>
  );
}

