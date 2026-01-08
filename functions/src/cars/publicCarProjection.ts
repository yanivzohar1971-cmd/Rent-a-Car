/**
 * PUBLIC Car Projection Service
 * 
 * This module handles the public projection of yard cars
 * stored in publicCars/{carId}.
 * 
 * The publicCars collection is a projection derived from MASTER (carSales).
 * It contains only fields needed for listing, filtering, and basic display.
 */

import * as admin from "firebase-admin";
import type { PublicCar } from "../types/cars";
import { getYardCarMaster } from "./masterCarService";

const db = admin.firestore();

/**
 * Admin Seller Exposure Configuration
 * 
 * Document structure in adminSellerExposure/{sellerUid}:
 * {
 *   sellerUid: string,
 *   sellerType: "YARD" | "AGENT",
 *   showNameInBadge: boolean,
 *   showLogo: boolean,
 *   showPhone: boolean,
 *   showWhatsapp: boolean,
 *   showCity: boolean,
 *   showAddress: boolean,
 *   updatedAt: Timestamp
 * }
 */
interface AdminSellerExposure {
  sellerUid: string;
  sellerType?: "YARD" | "AGENT";
  showNameInBadge?: boolean;
  showLogo?: boolean;
  showPhone?: boolean;
  showWhatsapp?: boolean;
  showCity?: boolean;
  showAddress?: boolean;
  updatedAt?: admin.firestore.Timestamp;
}

/**
 * Load admin seller exposure configuration
 * 
 * Returns default values when doc is missing:
 * - showNameInBadge: true
 * - showLogo: true
 * - showPhone: true
 * - showWhatsapp: true
 * - showCity: true
 * - showAddress: false (safer default)
 * 
 * @param sellerUid - Seller's Firebase Auth UID
 * @returns Admin exposure configuration with defaults
 */
async function loadAdminSellerExposure(sellerUid: string): Promise<AdminSellerExposure> {
  try {
    const exposureDocRef = db.collection('adminSellerExposure').doc(sellerUid);
    const exposureDoc = await exposureDocRef.get();
    
    if (!exposureDoc.exists) {
      // Missing doc => default behavior: everything true (except address default false)
      return {
        sellerUid,
        showNameInBadge: true,
        showLogo: true,
        showPhone: true,
        showWhatsapp: true,
        showCity: true,
        showAddress: false,
      };
    }
    
    const data = exposureDoc.data();
    if (!data) {
      // Empty doc => return defaults
      return {
        sellerUid,
        showNameInBadge: true,
        showLogo: true,
        showPhone: true,
        showWhatsapp: true,
        showCity: true,
        showAddress: false,
      };
    }
    
    // Return with defaults for missing fields
    return {
      sellerUid,
      sellerType: data.sellerType || undefined,
      showNameInBadge: data.showNameInBadge !== undefined ? data.showNameInBadge : true,
      showLogo: data.showLogo !== undefined ? data.showLogo : true,
      showPhone: data.showPhone !== undefined ? data.showPhone : true,
      showWhatsapp: data.showWhatsapp !== undefined ? data.showWhatsapp : true,
      showCity: data.showCity !== undefined ? data.showCity : true,
      showAddress: data.showAddress !== undefined ? data.showAddress : false,
      updatedAt: data.updatedAt || undefined,
    };
  } catch (error) {
    console.error(`[publicCarProjection] Error loading admin seller exposure for ${sellerUid}:`, error);
    // On error, return defaults (fail-safe)
    return {
      sellerUid,
      showNameInBadge: true,
      showLogo: true,
      showPhone: true,
      showWhatsapp: true,
      showCity: true,
      showAddress: false,
    };
  }
}

/**
 * Normalize phone number for WhatsApp (E164 format)
 * - Removes spaces, dashes, parentheses
 * - Converts Israeli local format (0xxxxxxxxx) to international (972xxxxxxxx)
 * - Returns E164 digits without '+' prefix
 */
function normalizePhoneForWhatsApp(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  
  // Remove all non-digit characters
  let digits = phone.replace(/[^0-9]/g, '');
  
  if (!digits || digits.length === 0) return null;
  
  // If starts with 0 (Israeli local), convert to 972
  if (digits.startsWith('0')) {
    digits = '972' + digits.substring(1);
  } else if (!digits.startsWith('972')) {
    // If doesn't start with 972, assume it's Israeli and add 972
    digits = '972' + digits;
  }
  
  return digits;
}

/**
 * Load public seller profile with unified resolution
 * For YARD: tries yards/{sellerUid} first, then falls back to users/{sellerUid}
 * For AGENT/PRIVATE: uses users/{sellerUid} (existing behavior)
 * 
 * PUBLIC SNAPSHOT — ALLOW-LIST ONLY. DO NOT EXTEND WITHOUT SECURITY REVIEW.
 * 
 * Returns ONLY the following public fields:
 * - sellerName (displayName/fullName)
 * - sellerPhone (phone/secondaryPhone)
 * - sellerWhatsappPhone (normalized E164)
 * - sellerLogoUrl (yardLogoUrl)
 * - sellerCity (city)
 * - sellerAddress (address)
 * 
 * Explicitly EXCLUDED:
 * - email, uid, internal flags, timestamps, private data
 * 
 * @param sellerUid - Seller's Firebase Auth UID (yard/agent/private)
 * @param sellerType - Seller type ('YARD' | 'AGENT' | 'PRIVATE')
 * @returns Seller snapshot data or null if not found
 */
async function loadPublicSellerProfile(
  sellerUid: string,
  sellerType: 'YARD' | 'AGENT' | 'PRIVATE'
): Promise<{
  sellerName: string | null;
  sellerPhone: string | null;
  sellerWhatsappPhone: string | null;
  sellerLogoUrl: string | null;
  sellerCity: string | null;
  sellerAddress: string | null;
  showSellerNameInBadge: boolean;
  source: 'yards' | 'users' | 'none';
} | null> {
  let data: any = null;
  let source: 'yards' | 'users' | 'none' = 'none';
  
  try {
    // For YARD: try yards/{sellerUid} first
    if (sellerType === 'YARD') {
      try {
        const yardDocRef = db.collection('yards').doc(sellerUid);
        const yardDoc = await yardDocRef.get();
        
        if (yardDoc.exists) {
          const yardData = yardDoc.data();
          if (yardData) {
            data = yardData;
            source = 'yards';
            // Dev-only debug log
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[publicCarProjection] Loaded YARD profile from yards/{${sellerUid}}`);
            }
          }
        }
      } catch (yardError) {
        // Silently fall through to users/{uid} fallback
        if (process.env.NODE_ENV !== 'production') {
          console.warn(`[publicCarProjection] Error loading from yards/{${sellerUid}}, falling back to users:`, yardError);
        }
      }
    }
    
    // Fallback to users/{sellerUid} if yards didn't work or for non-YARD
    if (!data || source === 'none') {
      const userDocRef = db.collection('users').doc(sellerUid);
      const userDoc = await userDocRef.get();
      
      if (!userDoc.exists) {
        console.warn(`[publicCarProjection] Seller profile not found for ${sellerUid} (tried ${sellerType === 'YARD' ? 'yards and ' : ''}users)`);
        return null;
      }
      
      const userData = userDoc.data();
      if (!userData) return null;
      
      data = userData;
      source = 'users';
      if (process.env.NODE_ENV !== 'production') {
        console.log(`[publicCarProjection] Loaded ${sellerType} profile from users/{${sellerUid}}`);
      }
    }
    
    // PUBLIC SNAPSHOT — ALLOW-LIST ONLY
    // Only extract fields explicitly allowed for public display
    // Support alternative field names for new yards (still allow-list, no private data)
    
    // PUBLIC SNAPSHOT — ALLOW-LIST ONLY
    // Only extract fields explicitly allowed for public display
    // Support alternative field names for new yards (still allow-list, no private data)
    
    // sellerName priority: displayName > fullName > yardName > businessName > companyName > name
    const sellerName = data.displayName || 
                      data.fullName || 
                      data.yardName || 
                      data.businessName || 
                      data.companyName || 
                      data.name || 
                      null;
    
    // sellerPhone priority: phone > secondaryPhone > phoneNumber > mobile > yardPhone > contactPhone
    const sellerPhone = data.phone || 
                       data.secondaryPhone || 
                       data.phoneNumber || 
                       data.mobile || 
                       data.yardPhone || 
                       data.contactPhone || 
                       null;
    
    // sellerLogoUrl priority: yardLogoUrl > logoUrl > logo
    const sellerLogoUrl = data.yardLogoUrl || 
                         data.logoUrl || 
                         data.logo || 
                         null;
    
    // sellerCity priority: city > sellerCity
    const sellerCity = data.city || 
                      data.sellerCity || 
                      null;
    
    // sellerAddress priority: address > sellerAddress
    const sellerAddress = data.address || 
                         data.sellerAddress || 
                         null;
    
    // sellerWhatsappPhone: prefer explicit whatsapp field, else normalize sellerPhone
    let sellerWhatsappPhone: string | null = null;
    if (data.whatsappPhone || data.yardWhatsappPhone) {
      sellerWhatsappPhone = normalizePhoneForWhatsApp(data.whatsappPhone || data.yardWhatsappPhone);
    } else if (sellerPhone) {
      sellerWhatsappPhone = normalizePhoneForWhatsApp(sellerPhone);
    }
    
    // Calculate showSellerNameInBadge based on promotion/billing
    // For YARD: true if has premium promotion (isPremium or active premiumUntil) or includedBranding
    // For AGENT: true always (default business rule)
    // For PRIVATE: false (not applicable, but handled in caller)
    let showSellerNameInBadge = false;
    
    // Check if this is a yard (has isYard flag or primaryRole === 'YARD')
    const isYard = data.isYard === true || data.primaryRole === 'YARD';
    const isAgent = data.isAgent === true || data.primaryRole === 'AGENT';
    
    if (isAgent) {
      // AGENT: always show name in badge
      showSellerNameInBadge = true;
    } else if (isYard) {
      // YARD: check promotion state or billing plan
      const promotion = data.promotion || {};
      const isPremium = promotion.isPremium === true;
      const premiumUntil = promotion.premiumUntil;
      
      // Check if premium is active (premiumUntil is null = unlimited, or in the future)
      let isPremiumActive = false;
      if (isPremium) {
        if (premiumUntil === null || premiumUntil === undefined) {
          // null/undefined = unlimited premium
          isPremiumActive = true;
        } else {
          // Check if timestamp is in the future
          const now = admin.firestore.Timestamp.now();
          if (premiumUntil.toMillis && premiumUntil.toMillis() > now.toMillis()) {
            isPremiumActive = true;
          } else if (premiumUntil.seconds && premiumUntil.seconds > now.seconds) {
            isPremiumActive = true;
          }
        }
      }
      
      // Check billing plan for includedBranding (if available)
      // Note: billing plan info might be in subscriptionPlan or billingPlan field
      const subscriptionPlan = data.subscriptionPlan || data.billingPlan;
      const hasBranding = subscriptionPlan === 'PLUS' || subscriptionPlan === 'PRO';
      
      showSellerNameInBadge = isPremiumActive || hasBranding;
    }
    // PRIVATE: showSellerNameInBadge remains false (handled by caller based on sellerType)
    
    // DO NOT include: email, uid, internal flags, timestamps, private data
    return {
      sellerName,
      sellerPhone,
      sellerWhatsappPhone,
      sellerLogoUrl,
      sellerCity,
      sellerAddress,
      showSellerNameInBadge,
      source,
    };
  } catch (error) {
    console.error(`[publicCarProjection] Error loading seller profile for ${sellerUid}:`, error);
    return null;
  }
}


/**
 * Convert timestamp-like value to milliseconds
 * 
 * Supports Timestamp (with toMillis()), Date, number, null/undefined
 * 
 * @param tsLike - Timestamp, Date, number, or null/undefined
 * @returns milliseconds since epoch, or 0 if invalid
 */
function toMs(tsLike: any): number {
  if (!tsLike) return 0;
  if (tsLike.toMillis && typeof tsLike.toMillis === 'function') {
    return tsLike.toMillis();
  }
  if (tsLike instanceof Date) {
    return tsLike.getTime();
  }
  if (tsLike.seconds !== undefined) {
    // Firestore Timestamp-like object
    return tsLike.seconds * 1000 + (tsLike.nanoseconds || 0) / 1000000;
  }
  if (typeof tsLike === 'number') {
    return tsLike;
  }
  return 0;
}

/**
 * Check if a promotion field is active (until timestamp is in the future)
 * 
 * @param until - Timestamp-like value (Timestamp, Date, number, null/undefined)
 * @returns true if until is valid and in the future
 */
function isActiveUntil(until: any): boolean {
  return toMs(until) > Date.now();
}

/**
 * Normalize a promotion timestamp to admin.firestore.Timestamp
 * 
 * Handles various input formats and converts to proper Firestore Timestamp.
 * This ensures the web always receives proper Timestamp objects long-term.
 * 
 * @param x - Timestamp in any format (Timestamp, {seconds, nanoseconds}, number, Date, etc.)
 * @returns admin.firestore.Timestamp or undefined if invalid
 */
function normalizePromoTimestamp(x: any): admin.firestore.Timestamp | undefined {
  if (!x) return undefined;
  
  try {
    // If already a Firestore Timestamp, return as-is
    if (x instanceof admin.firestore.Timestamp) {
      return x;
    }
    
    // If {seconds, nanoseconds} object
    if (typeof x === 'object' && x !== null && 'seconds' in x) {
      const seconds = x.seconds;
      const nanoseconds = x.nanoseconds || 0;
      if (typeof seconds === 'number') {
        return new admin.firestore.Timestamp(seconds, nanoseconds);
      }
    }
    
    // If number (ms or seconds)
    if (typeof x === 'number') {
      // If > 10^12, assume milliseconds; otherwise assume seconds
      const ms = x > 1e12 ? x : x * 1000;
      const seconds = Math.floor(ms / 1000);
      const nanoseconds = Math.floor((ms % 1000) * 1e6);
      return new admin.firestore.Timestamp(seconds, nanoseconds);
    }
    
    // If Date instance
    if (x instanceof Date) {
      const ms = x.getTime();
      const seconds = Math.floor(ms / 1000);
      const nanoseconds = Math.floor((ms % 1000) * 1e6);
      return new admin.firestore.Timestamp(seconds, nanoseconds);
    }
    
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check if a master car document is published
 * 
 * Tolerant publish detection to prevent mass-unpublish on format drift.
 * Supports multiple field formats and normalizes values safely.
 * 
 * @param data - Master car document data (from Firestore)
 * @returns true if the car is considered published
 */
export function isMasterCarPublished(data: any): boolean {
  // Normalize all candidate fields with TRIM + case normalization
  const statusStr = String(data?.status ?? '').trim().toLowerCase();
  const pubStr = String(data?.publicationStatus ?? '').trim().toUpperCase();
  const masterIsPublished = data?.isPublished === true; // Boolean check
  const visibilityStr = String(data?.visibility ?? '').trim().toUpperCase();
  
  // Hard exclusions first (MUST NOT publish)
  // Check saleStatus first - sold cars should never be published
  const saleStatus = String(data?.saleStatus ?? '').trim().toUpperCase();
  if (saleStatus === 'SOLD') {
    return false;
  }
  
  // Exclude archived/draft/hidden statuses
  if (statusStr === 'archived' || statusStr === 'draft' || statusStr === 'hidden') {
    return false;
  }
  
  // Exclude draft/hidden publication statuses
  if (pubStr === 'DRAFT' || pubStr === 'HIDDEN') {
    return false;
  }
  
  // Positive publish signals (ANY of these => true)
  // Legacy format: status === 'published' or 'publish'
  if (statusStr === 'published' || statusStr === 'publish') {
    return true;
  }
  
  // New format: publicationStatus === 'PUBLISHED', 'PUBLIC', or 'VISIBLE'
  if (pubStr === 'PUBLISHED' || pubStr === 'PUBLIC' || pubStr === 'VISIBLE') {
    return true;
  }
  
  // Direct boolean flag
  if (masterIsPublished === true) {
    return true;
  }
  
  // Visibility field
  if (visibilityStr === 'PUBLIC') {
    return true;
  }
  
  // If none matched => false (safe default)
  return false;
}

/**
 * Create or update a public car projection from a YardCarMaster
 * 
 * This function enforces the invariant that:
 * - publicCars/{carId} uses the same carId as MASTER
 * - ownerType = 'yard'
 * - yardUid is stored
 * - isPublished + publishedAt are set correctly
 * 
 * @param yardUid - Yard owner's Firebase Auth UID
 * @param carId - Car ID (must match MASTER carId)
 */
export async function upsertPublicCarFromMaster(
  yardUid: string,
  carId: string
): Promise<void> {
  try {
    // Step 1: Read MASTER from users/{yardUid}/carSales/{carId}
    const masterCar = await getYardCarMaster(yardUid, carId);
    
    if (!masterCar) {
      console.warn(`[publicCarProjection] MASTER car ${carId} not found for yard ${yardUid}, cannot create PUBLIC projection`);
      return;
    }
    
    // Step 2: Check if car is sold - sold cars should never be in publicCars
    if (masterCar.saleStatus === 'SOLD') {
      console.log(`[publicCarProjection] Car ${carId} is SOLD, unpublishing from publicCars`);
      await unpublishPublicCar(carId);
      return;
    }
    
    // Step 3: Only publish if status is 'published' OR publicationStatus is 'PUBLISHED'
    const isPublished = isMasterCarPublished(masterCar);
    
    // SAFETY: Never mass-unpublish due to missing fields
    // If master doc exists but BOTH status and publicationStatus are empty AND isPublished is not true:
    // treat it as "unknown" and DO NOT delete immediately (fail-safe)
    const statusEmpty = !masterCar.status || String(masterCar.status).trim() === '';
    const pubStatusEmpty = !(masterCar as any).publicationStatus || String((masterCar as any).publicationStatus).trim() === '';
    const isPublishedFlagFalse = (masterCar as any).isPublished !== true;
    const allFieldsEmpty = statusEmpty && pubStatusEmpty && isPublishedFlagFalse;
    
    if (!isPublished) {
      if (allFieldsEmpty) {
        // Missing fields can happen during partial writes/import; deleting causes data loss in publicCars
        console.warn(`[publicCarProjection] Car ${carId} (yard ${yardUid}): all publish fields empty/missing, treating as unknown - NOT unpublishing (fail-safe)`);
        return; // Fail-safe: do not delete if fields are missing
      }
      
      // If not published and fields are present, delete from publicCars
      // Log only in development to avoid noisy prod logs
      if (process.env.NODE_ENV === 'development' || process.env.FUNCTIONS_EMULATOR) {
        console.log(`[publicCarProjection] Car ${carId} (yard ${yardUid}): status="${masterCar.status}", publicationStatus="${(masterCar as any).publicationStatus}", isPublished=${isPublished} - unpublishing from publicCars`);
      }
      await unpublishPublicCar(carId);
      return;
    }
    
    // Step 4: Derive sellerType from master car
    // Priority: 1) car.sellerType, 2) yardUid → "YARD", 3) agentUid → "AGENT", 4) → "PRIVATE"
    let sellerType: 'YARD' | 'AGENT' | 'PRIVATE' = 'PRIVATE';
    const masterSellerType = (masterCar as any).sellerType;
    if (masterSellerType && ['YARD', 'AGENT', 'PRIVATE'].includes(masterSellerType)) {
      sellerType = masterSellerType;
    } else if (masterCar.yardUid) {
      sellerType = 'YARD';
    } else if ((masterCar as any).agentUid) {
      sellerType = 'AGENT';
    }
    
    // Step 5: Load seller snapshot for public display (only if sellerUid exists)
    const sellerUid = masterCar.yardUid || (masterCar as any).agentUid || null;
    const sellerSnapshot = sellerUid ? await loadPublicSellerProfile(sellerUid, sellerType) : null;
    
    // Step 5b: Load admin exposure flags (only for YARD/AGENT, not PRIVATE)
    const adminExposure = (sellerUid && (sellerType === 'YARD' || sellerType === 'AGENT')) 
      ? await loadAdminSellerExposure(sellerUid)
      : null;
    
    // Step 5c: Load viewsCount from carViewStats (if exists)
    let viewsCount: number | null = null;
    try {
      const statsRef = db.collection('carViewStats').doc(carId);
      const statsDoc = await statsRef.get();
      if (statsDoc.exists) {
        const statsData = statsDoc.data();
        if (typeof statsData?.viewsCount === 'number') {
          viewsCount = statsData.viewsCount;
        }
      }
    } catch (error) {
      // Silently fail - viewsCount is optional
      console.warn(`[publicCarProjection] Error loading viewsCount for ${carId}:`, error);
    }
    
    // Step 6: Build PublicCar projection with safe field handling
    // Safely handle imageUrls array - cap at 20 for details gallery (was 5)
    const safeImageUrls = Array.isArray(masterCar.imageUrls) ? masterCar.imageUrls : [];
    const safeImageUrlsCapped = safeImageUrls.slice(0, 20);
    
    // Ensure mainImageUrl fallback: if masterCar.mainImageUrl is null but we have URLs, use first URL
    const safeMain = (typeof masterCar.mainImageUrl === 'string' && masterCar.mainImageUrl.startsWith('http'))
      ? masterCar.mainImageUrl
      : (safeImageUrlsCapped[0] ?? null);
    
    // Handle city fields - write both for backward compatibility
    const city = masterCar.city || masterCar.cityNameHe || null;
    const cityNameHe = masterCar.cityNameHe || masterCar.city || null;
    
    // Read promotion from MASTER (only if exists - do not overwrite existing promotion with null/undefined)
    const promo = masterCar.promotion ?? undefined;
    
    // Normalize promotion timestamps when building publicCar
    // This ensures the web always receives proper Timestamp objects long-term
    // Note: showStripes and other boolean/string fields are preserved via spread operator
    let normalizedPromo: any = undefined;
    if (promo) {
      normalizedPromo = { ...promo };
      // Normalize all until fields to proper Firestore Timestamps
      if (promo.boostUntil !== undefined) {
        normalizedPromo.boostUntil = normalizePromoTimestamp(promo.boostUntil) || promo.boostUntil;
      }
      if (promo.highlightUntil !== undefined) {
        normalizedPromo.highlightUntil = normalizePromoTimestamp(promo.highlightUntil) || promo.highlightUntil;
      }
      if (promo.exposurePlusUntil !== undefined) {
        normalizedPromo.exposurePlusUntil = normalizePromoTimestamp(promo.exposurePlusUntil) || promo.exposurePlusUntil;
      }
      if (promo.platinumUntil !== undefined) {
        normalizedPromo.platinumUntil = normalizePromoTimestamp(promo.platinumUntil) || promo.platinumUntil;
      }
      if (promo.diamondUntil !== undefined) {
        normalizedPromo.diamondUntil = normalizePromoTimestamp(promo.diamondUntil) || promo.diamondUntil;
      }
      if (promo.bumpedAt !== undefined) {
        normalizedPromo.bumpedAt = normalizePromoTimestamp(promo.bumpedAt) || promo.bumpedAt;
      }
      // showStripes is preserved automatically via spread operator above
    }
    
    // Compute highlightLevel ONLY when promo exists (otherwise omit to avoid overwriting)
    let highlightLevel: 'none' | 'basic' | 'plus' | 'premium' | 'platinum' | 'diamond' | undefined = undefined;
    if (promo) {
      const isDiamondActive = isActiveUntil(promo.diamondUntil);
      const isPlatinumActive = isActiveUntil(promo.platinumUntil);
      const isHighlightActive = isActiveUntil(promo.highlightUntil);
      const isExposurePlusActive = isActiveUntil(promo.exposurePlusUntil);
      const isBoostActive = isActiveUntil(promo.boostUntil);
      
      if (isDiamondActive) {
        highlightLevel = 'diamond';
      } else if (isPlatinumActive) {
        highlightLevel = 'platinum';
      } else if (isBoostActive && isHighlightActive) {
        highlightLevel = 'premium';
      } else if (isHighlightActive) {
        highlightLevel = 'basic';
      } else if (isExposurePlusActive) {
        highlightLevel = 'plus';
      } else {
        highlightLevel = 'none';
      }
    }
    
    // Build PublicCar object - only include promotion if it exists (to avoid writing undefined)
    const publicCar: PublicCar = {
      carId: carId, // Same carId as MASTER
      yardUid: masterCar.yardUid,
      ownerType: 'yard',
      isPublished: true,
      publishedAt: Date.now(),
      highlightLevel: highlightLevel, // Only set if promo exists
      ...(normalizedPromo !== undefined ? { promotion: normalizedPromo } : {}), // Only include promotion if it exists
      brand: masterCar.brand || null,
      model: masterCar.model || null,
      year: masterCar.year || null,
      mileageKm: masterCar.mileageKm || null,
      price: masterCar.price || null,
      gearType: masterCar.gearType || null,
      fuelType: masterCar.fuelType || null,
      cityNameHe: cityNameHe,
      mainImageUrl: safeMain,
      // Store enough imageUrls for details gallery (capped at 20), safely handle empty/undefined
      imageUrls: safeImageUrlsCapped,
      bodyType: masterCar.bodyType || null,
      color: masterCar.color || null,
      createdAt: masterCar.createdAt || null,
      updatedAt: Date.now(),
    };
    
    // Step 6: Check if seller identity changed (prevent stale seller data leakage)
    const publicCarRef = db.collection("publicCars").doc(carId);
    const existingPublicCarDoc = await publicCarRef.get();
    const existingPublicCar = existingPublicCarDoc.exists ? existingPublicCarDoc.data() : null;
    
    // Log projection details for debugging
    console.log(`[publicCarProjection] Upserting publicCars/${carId} for yard ${yardUid}: isPublished=true, sellerType=${sellerType}, existingDoc=${existingPublicCarDoc.exists}`);
    
    // Detect seller identity change
    const existingSellerUid = existingPublicCar?.yardUid || existingPublicCar?.agentUid || null;
    const existingSellerType = existingPublicCar?.sellerType || null;
    const sellerChanged = (existingSellerUid && existingSellerUid !== sellerUid) || 
                          (existingSellerType && existingSellerType !== sellerType);
    
    // Handle AC field - support both hasAC and ac, write both for compatibility
    const hasACValue = (masterCar as any).hasAC ?? (masterCar as any).ac ?? (masterCar as any).airConditioning ?? null;
    const acValue = hasACValue !== null ? Boolean(hasACValue) : null;
    
    const updateData: any = {
      ...publicCar,
      // Additional fields Buyer page reads (from carsApi.ts analysis):
      city: city, // Buyer reads data.city
      regionId: masterCar.regionId || null, // Buyer reads data.regionId
      cityId: masterCar.cityId || null, // Buyer reads data.cityId
      regionNameHe: masterCar.regionNameHe || null, // Buyer reads data.regionNameHe
      neighborhoodId: null, // Not in MASTER, but Buyer may read it
      neighborhoodNameHe: null, // Not in MASTER, but Buyer may read it
      // Legacy fields for backward compatibility (written directly, not in PublicCar type)
      ownerUid: masterCar.yardUid, // Some Buyer code may read ownerUid
      userId: masterCar.yardUid, // Some Buyer code may read userId
      gearboxType: masterCar.gearType || masterCar.gearboxType || null, // Buyer reads gearboxType (alias for gearType)
      gear: masterCar.gearType || null, // Buyer may read 'gear' as fallback
      // Full spec fields for details page and advanced filters
      handCount: masterCar.handCount ?? null,
      ownershipType: (masterCar as any).ownershipType ?? null,
      importType: (masterCar as any).importType ?? null,
      previousUse: (masterCar as any).previousUse ?? null,
      engineDisplacementCc: masterCar.engineDisplacementCc ?? null,
      horsepower: masterCar.horsepower ?? null,
      numberOfGears: masterCar.numberOfGears ?? null,
      licensePlatePartial: masterCar.licensePlatePartial ?? null,
      notes: (masterCar as any).notes ?? null,
      // AC fields - write both for compatibility
      hasAC: acValue,
      ac: acValue,
      // Ensure imageUrls is always an array (even if empty) - cap at 20 for details gallery
      imageUrls: safeImageUrlsCapped,
      mainImageUrl: safeMain,
      // Seller snapshot for public display (no dependency on users/ read from client)
      sellerType: sellerType, // Derived from master car, not hardcoded
      // DO NOT write seller fields as explicit null - only attach if value exists
      // This prevents "null overwrites" for newly created yards when snapshot momentarily fails
      // Additional identification fields
      vin: (masterCar as any).vin ?? null,
      stockNumber: (masterCar as any).stockNumber ?? null,
      // Condition fields
      hasAccidents: (masterCar as any).hasAccidents ?? null,
      // Test/Registration fields
      testUntil: (masterCar as any).testUntil ?? (masterCar as any).testDate ?? null,
      testDate: (masterCar as any).testDate ?? null,
      registrationDate: (masterCar as any).registrationDate ?? null,
      // Views count (from carViewStats aggregate)
      ...(viewsCount !== null ? { viewsCount } : {}),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: publicCar.createdAt 
        ? admin.firestore.Timestamp.fromMillis(publicCar.createdAt)
        : admin.firestore.FieldValue.serverTimestamp(),
    };
    
    // Only include promotion if it exists on MASTER (to avoid overwriting existing promotion with undefined)
    // Note: promotion is already conditionally included in publicCar spread above
    // Only include highlightLevel if promo exists (to avoid overwriting existing highlightLevel)
    if (highlightLevel === undefined) {
      // Remove highlightLevel from updateData if promo doesn't exist (to avoid writing undefined)
      delete updateData.highlightLevel;
    }
    
    // Step 7: Clear stale seller fields if seller identity changed
    // CRITICAL: Prevent wrong seller identity display - better to show "unknown" than wrong yard
    if (sellerChanged) {
      console.log(`[publicCarProjection] Seller identity changed for car ${carId}: ${existingSellerUid} -> ${sellerUid}, clearing stale seller fields`);
      // Explicitly clear all seller-related fields to prevent stale data leakage
      updateData.yardName = null;
      updateData.yardDisplayName = null;
      updateData.sellerDisplayName = null;
      updateData.yardPhone = null;
      updateData.sellerPhone = null;
      updateData.yardWhatsappPhone = null;
      updateData.sellerWhatsappPhone = null;
      updateData.yardLogoUrl = null;
      updateData.sellerLogoUrl = null;
      updateData.sellerCity = null;
      updateData.sellerAddress = null;
      // Clear exposure flags too (they are seller-specific)
      updateData.showSellerNameInBadge = null;
      updateData.showSellerLogo = null;
      updateData.showSellerPhone = null;
      updateData.showSellerWhatsapp = null;
    }
    
    // Step 8: Apply admin exposure flags to seller snapshot fields
    // Rules:
    // - If showNameInBadge=false -> write showSellerNameInBadge=false and DO NOT write sellerDisplayName (or keep it null)
    // - If showLogo=false -> write showSellerLogo=false and DO NOT write sellerLogoUrl
    // - If showPhone=false -> write showSellerPhone=false and DO NOT write sellerPhone
    // - If showWhatsapp=false -> write showSellerWhatsapp=false and DO NOT write sellerWhatsappPhone
    // - If showCity=false -> DO NOT write sellerCity
    // - If showAddress=false -> DO NOT write sellerAddress
    // - Null-overwrite protection: Do NOT overwrite existing publicCars seller fields with null (unless seller changed)
    // - Only set a public field when you have a non-empty value AND exposure flag allows it
    
    // Calculate showSellerNameInBadge based on admin exposure
    let showSellerNameInBadge: boolean | undefined = undefined;
    if (sellerType === 'PRIVATE') {
      showSellerNameInBadge = false;
    } else if (adminExposure) {
      // Use admin exposure flag (defaults to true if missing)
      showSellerNameInBadge = adminExposure.showNameInBadge === false ? false : undefined;
    }
    // undefined means "default to true" (handled in web utility)
    
    // Apply exposure flags to seller fields (only if seller didn't change OR we have new seller data)
    // If seller changed and new seller profile not found, leave fields as null (cleared above)
    if (!sellerChanged || sellerSnapshot) {
      if (adminExposure?.showNameInBadge !== false && sellerSnapshot?.sellerName) {
        updateData.yardName = sellerSnapshot.sellerName;
        updateData.yardDisplayName = sellerSnapshot.sellerName; // Alias for backward compatibility
        updateData.sellerDisplayName = sellerSnapshot.sellerName; // Standard field name for seller name
      }
      
      if (adminExposure?.showPhone !== false && sellerSnapshot?.sellerPhone) {
        updateData.yardPhone = sellerSnapshot.sellerPhone;
        updateData.sellerPhone = sellerSnapshot.sellerPhone; // Standard field name
      }
      
      if (adminExposure?.showWhatsapp !== false && sellerSnapshot?.sellerWhatsappPhone) {
        updateData.yardWhatsappPhone = sellerSnapshot.sellerWhatsappPhone;
        updateData.sellerWhatsappPhone = sellerSnapshot.sellerWhatsappPhone; // Standard field name
      }
      
      if (adminExposure?.showLogo !== false && sellerSnapshot?.sellerLogoUrl) {
        updateData.yardLogoUrl = sellerSnapshot.sellerLogoUrl;
        updateData.sellerLogoUrl = sellerSnapshot.sellerLogoUrl; // Standard field name for seller logo
      }
      
      if (adminExposure?.showCity !== false && sellerSnapshot?.sellerCity) {
        updateData.sellerCity = sellerSnapshot.sellerCity;
      }
      
      if (adminExposure?.showAddress !== false && sellerSnapshot?.sellerAddress) {
        updateData.sellerAddress = sellerSnapshot.sellerAddress;
      }
    }
    
    // Write exposure flags to publicCars (for web UI to use)
    if (adminExposure) {
      updateData.showSellerNameInBadge = adminExposure.showNameInBadge === false ? false : undefined;
      updateData.showSellerLogo = adminExposure.showLogo === false ? false : undefined;
      updateData.showSellerPhone = adminExposure.showPhone === false ? false : undefined;
      updateData.showSellerWhatsapp = adminExposure.showWhatsapp === false ? false : undefined;
    } else if (sellerType === 'PRIVATE') {
      // PRIVATE: always hide exposure flags
      updateData.showSellerNameInBadge = false;
    }
    
    // Only write showSellerNameInBadge if explicitly false (to disable name exposure)
    // If undefined, web will treat as true (default paid behavior)
    if (showSellerNameInBadge === false) {
      updateData.showSellerNameInBadge = false;
    }
    // If undefined, don't write it - web will default to true
    
    // Step 9: Write to Firestore
    // CRITICAL: Ensure isPublished is always true when writing published cars
    // Also ensure seller snapshot load failure doesn't abort core car write
    try {
      await publicCarRef.set(updateData, { merge: true });
      console.log(`[publicCarProjection] Successfully wrote publicCars/${carId} with isPublished=true, yardUid=${yardUid}, sellerType=${sellerType}`);
    } catch (writeError: any) {
      // If write fails, log but try to write core fields anyway (seller snapshot is optional)
      console.error(`[publicCarProjection] Error writing publicCars/${carId}, attempting core fields only:`, {
        carId,
        yardUid,
        error: writeError instanceof Error ? writeError.message : String(writeError),
        errorCode: writeError?.code,
      });
      
      // Retry with minimal core fields (car basics only, no seller snapshot)
      try {
        const coreFields: any = {
          carId: carId,
          yardUid: masterCar.yardUid,
          ownerType: 'yard',
          isPublished: true, // CRITICAL: always true for published cars
          publishedAt: admin.firestore.FieldValue.serverTimestamp(),
          brand: masterCar.brand || null,
          model: masterCar.model || null,
          year: masterCar.year || null,
          mileageKm: masterCar.mileageKm || null,
          price: masterCar.price || null,
          gearType: masterCar.gearType || null,
          fuelType: masterCar.fuelType || null,
          cityNameHe: cityNameHe,
          city: city,
          mainImageUrl: safeMain,
          imageUrls: safeImageUrlsCapped,
          bodyType: masterCar.bodyType || null,
          color: masterCar.color || null,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        
        await publicCarRef.set(coreFields, { merge: true });
        console.log(`[publicCarProjection] Wrote core fields only for publicCars/${carId} (seller snapshot failed)`);
      } catch (coreWriteError: any) {
        // If even core write fails, throw (this is a critical error)
        console.error(`[publicCarProjection] Critical: failed to write core fields for publicCars/${carId}:`, {
          carId,
          yardUid,
          error: coreWriteError instanceof Error ? coreWriteError.message : String(coreWriteError),
          errorCode: coreWriteError?.code,
        });
        throw coreWriteError;
      }
    }
  } catch (error: any) {
    console.error(`[publicCarProjection] Error upserting PUBLIC car ${carId}:`, {
      carId,
      yardUid,
      error: error instanceof Error ? error.message : String(error),
      errorCode: error?.code,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

/**
 * Unpublish a car (delete from publicCars or mark as unpublished)
 * 
 * @param carId - Car ID (must match MASTER carId)
 */
export async function unpublishPublicCar(carId: string): Promise<void> {
  try {
    if (!carId || typeof carId !== 'string' || carId.trim() === '') {
      throw new Error('carId must be a non-empty string');
    }
    
    const publicCarRef = db.collection("publicCars").doc(carId);
    
    // Delete the document entirely
    // This is cleaner and ensures no stale data
    await publicCarRef.delete();
    
    console.log(`[publicCarProjection] Unpublished PUBLIC car (deleted): ${carId}`);
  } catch (error: any) {
    // If document doesn't exist, that's fine (already unpublished)
    if (error?.code === 5) { // NOT_FOUND error code
      console.log(`[publicCarProjection] PUBLIC car already unpublished: ${carId}`);
      return;
    }
    
    console.error(`[publicCarProjection] Error unpublishing PUBLIC car ${carId}:`, error);
    throw error;
  }
}

/**
 * Batch unpublish multiple cars
 * 
 * @param carIds - Array of car IDs to unpublish
 */
export async function batchUnpublishPublicCars(carIds: string[]): Promise<void> {
  try {
    await Promise.all(carIds.map(carId => unpublishPublicCar(carId)));
    console.log(`[publicCarProjection] Batch unpublished cars: ${carIds.length}`);
  } catch (error) {
    console.error(`[publicCarProjection] Error batch unpublishing cars:`, error);
    throw error;
  }
}

