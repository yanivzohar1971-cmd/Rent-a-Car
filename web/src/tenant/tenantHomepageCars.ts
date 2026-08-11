import type { PublicCar } from '../types/cars';
import { orderPublicCarsByFeaturedIds } from './tenantFeaturedCars';

function isPublishedPublicCar(car: PublicCar): boolean {
  return car.isPublished === true;
}

function isHomepageCarouselFlagOn(car: PublicCar): boolean {
  return car.showInHomeCarousel === true;
}

/** If saleStatus ever appears on a public projection doc, treat as ineligible. */
function hasStaleSoldSignal(car: PublicCar): boolean {
  return (car as { saleStatus?: string }).saleStatus === 'SOLD';
}

/**
 * Single predicate for the **new** homepage flow: tenant-scoped published inventory
 * (caller must already pass cars from `fetchPublicCars` with the same tenant scope as the site)
 * plus explicit homepage intent on the car record.
 */
export function isTenantHomepageNewFlowEligibleCar(car: PublicCar): boolean {
  if (!car?.carId) return false;
  if (!isPublishedPublicCar(car)) return false;
  if (!isHomepageCarouselFlagOn(car)) return false;
  if (hasStaleSoldSignal(car)) return false;
  return true;
}

function isLegacyFeaturedEligibleCar(car: PublicCar): boolean {
  return isPublishedPublicCar(car) && !hasStaleSoldSignal(car);
}

/** Newest-first for stable homepage ordering when multiple cars are flagged. */
export function sortTenantHomepageCarsForDisplay(cars: PublicCar[]): PublicCar[] {
  return [...cars].sort((a, b) => {
    const ta =
      (typeof a.updatedAt === 'number' ? a.updatedAt : 0) ||
      (typeof a.publishedAt === 'number' ? a.publishedAt : 0) ||
      (typeof a.createdAt === 'number' ? a.createdAt : 0);
    const tb =
      (typeof b.updatedAt === 'number' ? b.updatedAt : 0) ||
      (typeof b.publishedAt === 'number' ? b.publishedAt : 0) ||
      (typeof b.createdAt === 'number' ? b.createdAt : 0);
    if (tb !== ta) return tb - ta;
    return String(a.carId).localeCompare(String(b.carId));
  });
}

export function filterNewFlowTenantHomepageCars(tenantScopedPublishedCars: PublicCar[]): PublicCar[] {
  return sortTenantHomepageCarsForDisplay(tenantScopedPublishedCars.filter(isTenantHomepageNewFlowEligibleCar));
}

function computeLegacyHomepageCars(
  tenantScopedPublishedCars: PublicCar[],
  featuredCarIds: string[],
): PublicCar[] {
  return orderPublicCarsByFeaturedIds(tenantScopedPublishedCars, featuredCarIds).filter(isLegacyFeaturedEligibleCar);
}

/**
 * How the tenant homepage resolves its car list after step 2+.
 * - `yard_managed` — at least one scoped published car qualifies via `showInHomeCarousel` (primary product path).
 * - `legacy_fallback` — no such cars; non-empty list comes from stored `layout.featuredCarIds` order only (legacy).
 * - `none` — nothing to show.
 */
export type TenantHomepageSelectionMode = 'yard_managed' | 'legacy_fallback' | 'none';

export interface TenantHomepageSelectionMeta {
  mode: TenantHomepageSelectionMode;
  cars: PublicCar[];
  /** Count of cars that qualify for the new flow (equals `cars.length` when `mode === 'yard_managed'`). */
  newFlowEligibleCount: number;
}

/**
 * Single source of truth for tenant homepage car resolution + observability mode.
 * {@link selectTenantHomepagePublicCars} returns only `cars` from this result.
 */
export function getTenantHomepageSelectionMeta(
  tenantScopedPublishedCars: PublicCar[],
  featuredCarIds: string[],
): TenantHomepageSelectionMeta {
  const newFlow = filterNewFlowTenantHomepageCars(tenantScopedPublishedCars);
  const newFlowEligibleCount = newFlow.length;
  if (newFlow.length > 0) {
    return { mode: 'yard_managed', cars: newFlow, newFlowEligibleCount };
  }
  const legacy = computeLegacyHomepageCars(tenantScopedPublishedCars, featuredCarIds);
  return {
    mode: legacy.length > 0 ? 'legacy_fallback' : 'none',
    cars: legacy,
    newFlowEligibleCount: 0,
  };
}

/**
 * PRECEDENCE (tenant homepage; deterministic):
 *
 * 1. **New flow:** If at least one scoped published car passes {@link isTenantHomepageNewFlowEligibleCar},
 *    return **only** those cars (sorted newest first).
 *
 * 2. **Legacy fallback:** Otherwise, use stored `layout.featuredCarIds` order via {@link orderPublicCarsByFeaturedIds}
 *    (legacy homepage IDs only — not editable in the builder after step 2).
 *
 * No “first N from inventory” fallback.
 */
export function selectTenantHomepagePublicCars(
  tenantScopedPublishedCars: PublicCar[],
  featuredCarIds: string[],
): PublicCar[] {
  return getTenantHomepageSelectionMeta(tenantScopedPublishedCars, featuredCarIds).cars;
}

/** Subtle Hebrew one-liner for builder structure strip / summaries (admin-only). */
export function tenantHomepageBuilderSummaryHe(meta: TenantHomepageSelectionMeta): string {
  const n = meta.cars.length;
  switch (meta.mode) {
    case 'yard_managed':
      return `מנוהל מהמלאי · ${n} רכב${n === 1 ? '' : 'ים'} לדף הבית`;
    case 'legacy_fallback':
      return `מצב ישן · ${n} רכב${n === 1 ? '' : 'ים'} (רשימה שמורה; מומלץ סימון במלאי)`;
    case 'none':
    default:
      return 'אין רכבים לדף הבית';
  }
}
