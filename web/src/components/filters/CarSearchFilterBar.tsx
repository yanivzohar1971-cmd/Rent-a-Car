import { useState } from 'react';
import type { CarFilters } from '../../api/carsApi';
import { FilterChip } from './FilterChip';
import { BrandFilterDialog } from './BrandFilterDialog';
import { PriceFilterDialog } from './PriceFilterDialog';
import { YearFilterDialog } from './YearFilterDialog';
import { CarTypeFilterDialog } from './CarTypeFilterDialog';
import { BodyType } from '../../types/carTypes';
import { FuelType } from '../../types/carTypes';
import './CarSearchFilterBar.css';

export interface CarSearchFilterBarProps {
  filters: CarFilters;
  onChange: (filters: CarFilters) => void;
}

export function CarSearchFilterBar({ filters, onChange }: CarSearchFilterBarProps) {
  const [activeDialog, setActiveDialog] = useState<
    'brand' | 'price' | 'year' | 'type' | null
  >(null);

  // Extract selected brands (manufacturer field can be single or multiple)
  // For now, we'll support single manufacturer but prepare for multi
  const selectedBrands: string[] = filters.manufacturer ? [filters.manufacturer] : [];

  // Count active filters for badges
  const getActiveCount = (): Record<string, number> => {
    const counts: Record<string, number> = {};
    
    // Brand count
    if (selectedBrands.length > 0) {
      counts.brand = selectedBrands.length;
    }
    
    // Price count
    if (filters.priceFrom !== undefined || filters.priceTo !== undefined) {
      counts.price = 1;
    }
    
    // Year count
    if (filters.yearFrom !== undefined || filters.yearTo !== undefined) {
      counts.year = 1;
    }
    
    // Type count (body types + fuel types)
    const typeCount = (filters.bodyTypes?.length || 0) + (filters.fuelTypes?.length || 0);
    if (typeCount > 0) {
      counts.type = typeCount;
    }
    
    return counts;
  };

  const activeCounts = getActiveCount();

  const handleBrandConfirm = (brands: string[]) => {
    // For now, take first brand (single selection)
    // In future, can support multiple brands
    onChange({
      ...filters,
      manufacturer: brands.length > 0 ? brands[0] : undefined,
    });
  };

  const handleBrandReset = () => {
    onChange({
      ...filters,
      manufacturer: undefined,
    });
  };

  const handlePriceConfirm = (priceFrom?: number, priceTo?: number) => {
    onChange({
      ...filters,
      priceFrom,
      priceTo,
    });
  };

  const handlePriceReset = () => {
    onChange({
      ...filters,
      priceFrom: undefined,
      priceTo: undefined,
    });
  };

  const handleYearConfirm = (yearFrom?: number, yearTo?: number) => {
    onChange({
      ...filters,
      yearFrom,
      yearTo,
    });
  };

  const handleYearReset = () => {
    onChange({
      ...filters,
      yearFrom: undefined,
      yearTo: undefined,
    });
  };

  const handleTypeConfirm = (bodyTypes: BodyType[], fuelTypes: FuelType[]) => {
    onChange({
      ...filters,
      bodyTypes: bodyTypes.length > 0 ? bodyTypes : undefined,
      fuelTypes: fuelTypes.length > 0 ? fuelTypes : undefined,
    });
  };

  const handleTypeReset = () => {
    onChange({
      ...filters,
      bodyTypes: undefined,
      fuelTypes: undefined,
    });
  };

  return (
    <div className="car-search-filter-bar" dir="rtl">
      <div className="filter-chips-container">
        <FilterChip
          label="סוג"
          isActive={activeCounts.type > 0}
          activeBadgeText={activeCounts.type > 0 ? `(${activeCounts.type})` : undefined}
          onClick={() => setActiveDialog('type')}
        />
        <FilterChip
          label="יצרן"
          isActive={activeCounts.brand > 0}
          activeBadgeText={activeCounts.brand > 0 ? `(${activeCounts.brand})` : undefined}
          onClick={() => setActiveDialog('brand')}
        />
        <FilterChip
          label="דגם"
          isActive={!!filters.model}
          onClick={() => {
            // TODO: Implement model filter dialog
            alert('פילטר דגם יושם בקרוב');
          }}
        />
        <FilterChip
          label="שנה"
          isActive={activeCounts.year > 0}
          activeBadgeText={activeCounts.year > 0 ? '(1)' : undefined}
          onClick={() => setActiveDialog('year')}
        />
        <FilterChip
          label="מחיר"
          isActive={activeCounts.price > 0}
          activeBadgeText={activeCounts.price > 0 ? '(1)' : undefined}
          onClick={() => setActiveDialog('price')}
        />
      </div>

      {/* Dialogs */}
      {activeDialog === 'brand' && (
        <BrandFilterDialog
          selectedBrands={selectedBrands}
          onConfirm={handleBrandConfirm}
          onReset={handleBrandReset}
          onClose={() => setActiveDialog(null)}
        />
      )}

      {activeDialog === 'price' && (
        <PriceFilterDialog
          priceFrom={filters.priceFrom}
          priceTo={filters.priceTo}
          onConfirm={handlePriceConfirm}
          onReset={handlePriceReset}
          onClose={() => setActiveDialog(null)}
        />
      )}

      {activeDialog === 'year' && (
        <YearFilterDialog
          yearFrom={filters.yearFrom}
          yearTo={filters.yearTo}
          onConfirm={handleYearConfirm}
          onReset={handleYearReset}
          onClose={() => setActiveDialog(null)}
        />
      )}

      {activeDialog === 'type' && (
        <CarTypeFilterDialog
          selectedBodyTypes={filters.bodyTypes || []}
          selectedFuelTypes={filters.fuelTypes || []}
          onConfirm={handleTypeConfirm}
          onReset={handleTypeReset}
          onClose={() => setActiveDialog(null)}
        />
      )}
    </div>
  );
}

