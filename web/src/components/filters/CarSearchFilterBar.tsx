import { useState } from 'react';
import type { CarFilters } from '../../api/carsApi';
import { FilterChip } from './FilterChip';
import { BrandFilterDialog } from './BrandFilterDialog';
import { ModelFilterDialog } from './ModelFilterDialog';
import { PriceFilterDialog } from './PriceFilterDialog';
import { YearFilterDialog } from './YearFilterDialog';
import { CarTypeFilterDialog } from './CarTypeFilterDialog';
import { BodyType } from '../../types/carTypes';
import { FuelType } from '../../types/carTypes';
import './CarSearchFilterBar.css';

export interface CarSearchFilterBarProps {
  filters: CarFilters;
  onChange: (filters: CarFilters) => void;
  onResetAll?: () => void;
}

export function CarSearchFilterBar({ filters, onChange, onResetAll }: CarSearchFilterBarProps) {
  const [activeDialog, setActiveDialog] = useState<
    'brand' | 'model' | 'price' | 'year' | 'type' | null
  >(null);

  // Extract selected brands (manufacturer field can be single or multiple)
  // For now, we'll support single manufacturer but prepare for multi
  const selectedBrands: string[] = filters.manufacturerIds && filters.manufacturerIds.length > 0
    ? filters.manufacturerIds
    : filters.manufacturer
      ? [filters.manufacturer]
      : [];

  // Check if any filters are active
  const hasAnyActiveFilter = (): boolean => {
    return !!(
      (filters.manufacturerIds && filters.manufacturerIds.length > 0) ||
      filters.manufacturer ||
      filters.model ||
      filters.yearFrom !== undefined ||
      filters.yearTo !== undefined ||
      filters.priceFrom !== undefined ||
      filters.priceTo !== undefined ||
      (filters.bodyTypes && filters.bodyTypes.length > 0) ||
      (filters.fuelTypes && filters.fuelTypes.length > 0) ||
      (filters.gearboxTypes && filters.gearboxTypes.length > 0) ||
      filters.kmFrom !== undefined ||
      filters.kmTo !== undefined ||
      filters.acRequired !== null && filters.acRequired !== undefined ||
      filters.color ||
      filters.regionId ||
      filters.cityId
    );
  };

  const anyFilterActive = hasAnyActiveFilter();

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
    onChange({
      ...filters,
      manufacturerIds: brands.length > 0 ? brands : undefined,
      manufacturer: undefined, // Clear legacy field
    });
  };

  const handleBrandReset = () => {
    onChange({
      ...filters,
      manufacturerIds: undefined,
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

  const handleModelConfirm = (model: string) => {
    onChange({
      ...filters,
      model: model || undefined,
    });
  };

  const handleModelReset = () => {
    onChange({
      ...filters,
      model: undefined,
    });
  };

  return (
    <div className="car-search-filter-bar" dir="rtl">
      <div className="filter-chips-container">
        {/* Type Filter */}
        <div className="filter-chip-wrapper">
          <FilterChip
            label="סוג"
            isActive={activeCounts.type > 0}
            activeBadgeText={activeCounts.type > 0 ? `(${activeCounts.type})` : undefined}
            onClick={() => setActiveDialog(activeDialog === 'type' ? null : 'type')}
          />
        </div>

        {/* Brand Filter */}
        <div className="filter-chip-wrapper">
          <FilterChip
            label="יצרן"
            isActive={activeCounts.brand > 0}
            activeBadgeText={activeCounts.brand > 0 ? `(${activeCounts.brand})` : undefined}
            onClick={() => setActiveDialog(activeDialog === 'brand' ? null : 'brand')}
          />
        </div>

        {/* Model Filter */}
        <div className="filter-chip-wrapper">
          <FilterChip
            label="דגם"
            isActive={!!filters.model}
            onClick={() => setActiveDialog(activeDialog === 'model' ? null : 'model')}
          />
        </div>

        {/* Year Filter */}
        <div className="filter-chip-wrapper">
          <FilterChip
            label="שנה"
            isActive={activeCounts.year > 0}
            activeBadgeText={activeCounts.year > 0 ? '(1)' : undefined}
            onClick={() => setActiveDialog(activeDialog === 'year' ? null : 'year')}
          />
        </div>

        {/* Price Filter */}
        <div className="filter-chip-wrapper">
          <FilterChip
            label="מחיר"
            isActive={activeCounts.price > 0}
            activeBadgeText={activeCounts.price > 0 ? '(1)' : undefined}
            onClick={() => setActiveDialog(activeDialog === 'price' ? null : 'price')}
          />
        </div>

        {/* Reset All Filters */}
        {onResetAll && (
          <FilterChip
            label="איפוס"
            isActive={anyFilterActive}
            disabled={!anyFilterActive}
            onClick={() => {
              if (anyFilterActive && onResetAll) {
                onResetAll();
              }
            }}
          />
        )}
      </div>

      {/* Filter Dialogs - rendered in a backdrop for desktop modal / mobile bottom sheet */}
      {activeDialog && (
        <div 
          className="filter-dialog-backdrop" 
          onClick={(e) => {
            // Close when clicking backdrop (not the dialog itself)
            if (e.target === e.currentTarget) {
              setActiveDialog(null);
            }
          }}
        >
          {activeDialog === 'type' && (
            <CarTypeFilterDialog
              selectedBodyTypes={filters.bodyTypes || []}
              selectedFuelTypes={filters.fuelTypes || []}
              onConfirm={handleTypeConfirm}
              onReset={handleTypeReset}
              onClose={() => setActiveDialog(null)}
              mode="popover"
            />
          )}
          {activeDialog === 'brand' && (
            <BrandFilterDialog
              selectedBrands={selectedBrands}
              onConfirm={handleBrandConfirm}
              onReset={handleBrandReset}
              onClose={() => setActiveDialog(null)}
              mode="popover"
            />
          )}
          {activeDialog === 'model' && (
            <ModelFilterDialog
              selectedBrands={selectedBrands}
              selectedModel={filters.model}
              onConfirm={handleModelConfirm}
              onReset={handleModelReset}
              onClose={() => setActiveDialog(null)}
              mode="popover"
            />
          )}
          {activeDialog === 'year' && (
            <YearFilterDialog
              yearFrom={filters.yearFrom}
              yearTo={filters.yearTo}
              onConfirm={handleYearConfirm}
              onReset={handleYearReset}
              onClose={() => setActiveDialog(null)}
              mode="popover"
            />
          )}
          {activeDialog === 'price' && (
            <PriceFilterDialog
              priceFrom={filters.priceFrom}
              priceTo={filters.priceTo}
              onConfirm={handlePriceConfirm}
              onReset={handlePriceReset}
              onClose={() => setActiveDialog(null)}
              mode="popover"
            />
          )}
        </div>
      )}
    </div>
  );
}

