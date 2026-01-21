/**
 * Admin Debug: Seller Profile Resolver
 * 
 * Diagnostic callable to inspect seller/yard profile resolution
 * Returns JSON protocol with sources, detected keys, and missing fields
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { resolveYardProfile } from '../cars/publicCarProjection';
import { loadAdminSellerExposure } from '../cars/publicCarProjection';

const db = admin.firestore();

/**
 * Admin-only callable to debug seller profile resolution
 * 
 * Input: { sellerUid: string, sellerType?: 'YARD'|'AGENT'|'PRIVATE' }
 * Output: JSON protocol with resolution details
 */
export const adminDebugResolveSellerProfile = functions.https.onCall(
  async (data, context) => {
    // Admin-only guard
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated',
        'User must be authenticated'
      );
    }
    
    const uid = context.auth.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data();
    const isAdmin = userData?.primaryRole === 'ADMIN' || userData?.isAdmin === true;
    
    if (!isAdmin) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Only admins can access this function'
      );
    }
    
    const sellerUid = data?.sellerUid;
    const sellerType = data?.sellerType || 'YARD';
    
    if (!sellerUid || typeof sellerUid !== 'string') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'sellerUid is required and must be a string'
      );
    }
    
    if (!['YARD', 'AGENT', 'PRIVATE'].includes(sellerType)) {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'sellerType must be YARD, AGENT, or PRIVATE'
      );
    }
    
    // Track sources tried
    const sourcesTried = {
      usersDoc: { tried: false, exists: false, used: false },
      yardsDoc: { tried: false, exists: false, used: false },
    };
    
    // Try users/{sellerUid} first
    let usersData: any = null;
    sourcesTried.usersDoc.tried = true;
    try {
      const userDoc = await db.collection('users').doc(sellerUid).get();
      sourcesTried.usersDoc.exists = userDoc.exists;
      if (userDoc.exists) {
        usersData = userDoc.data();
      }
    } catch (error) {
      // Silently continue
    }
    
    // Try yards/{sellerUid} (for YARD type)
    let yardsData: any = null;
    if (sellerType === 'YARD') {
      sourcesTried.yardsDoc.tried = true;
      try {
        const yardDoc = await db.collection('yards').doc(sellerUid).get();
        sourcesTried.yardsDoc.exists = yardDoc.exists;
        if (yardDoc.exists) {
          yardsData = yardDoc.data();
        }
      } catch (error) {
        // Silently continue
      }
    }
    
    // Determine which source was used
    let resolvedProfile: {
      name: string | null;
      phone: string | null;
      whatsapp: string | null;
      logoUrl: string | null;
      city: string | null;
      address: string | null;
    };
    let detectedKeys: {
      hasDisplayName: boolean;
      hasFullName: boolean;
      hasBusinessName: boolean;
      hasPhone: boolean;
      hasWhatsapp: boolean;
      hasLogo: boolean;
      hasCity: boolean;
      hasAddress: boolean;
      hasWebsite: boolean;
    };
    let missing: string[] = [];
    
    if (sellerType === 'YARD') {
      // Use resolveYardProfile helper
      const yardProfile = await resolveYardProfile(sellerUid);
      resolvedProfile = {
        name: yardProfile.name,
        phone: yardProfile.phone,
        whatsapp: yardProfile.whatsapp,
        logoUrl: yardProfile.logoUrl,
        city: yardProfile.city,
        address: yardProfile.address,
      };
      missing = yardProfile.missingFields;
      
      // Determine which source was used
      if (yardProfile.source.startsWith('users/')) {
        sourcesTried.usersDoc.used = true;
      } else if (yardProfile.source.startsWith('yards/')) {
        sourcesTried.yardsDoc.used = true;
      }
      
      // Build detected keys from the data we have access to
      const data = usersData || yardsData || {};
      detectedKeys = {
        hasDisplayName: Boolean(data.displayName),
        hasFullName: Boolean(data.fullName),
        hasBusinessName: Boolean(data.businessName || data.companyName),
        hasPhone: Boolean(data.phone || data.phoneNumber || data.mobile),
        hasWhatsapp: Boolean(data.whatsapp || data.whatsappPhone || data.whatsappServicePhone),
        hasLogo: Boolean(data.logoUrl || data.yardLogoUrl || data.logo),
        hasCity: Boolean(data.city || data.addressCity),
        hasAddress: Boolean(data.address || data.streetAddress),
        hasWebsite: Boolean(data.website),
      };
    } else {
      // For AGENT/PRIVATE, use users/{sellerUid} only
      const data = usersData || {};
      sourcesTried.usersDoc.used = usersData !== null;
      
      // Resolve fields (similar to loadPublicSellerProfile logic)
      const normalizeString = (value: any): string | null => {
        if (typeof value !== 'string') return null;
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
      };
      
      const name = normalizeString(
        data.displayName ||
        data.fullName ||
        data.name ||
        data.contactName ||
        null
      );
      
      const phone = normalizeString(
        data.phone ||
        data.phoneNumber ||
        data.mobile ||
        data.secondaryPhone ||
        null
      );
      
      const whatsappRaw = normalizeString(
        data.whatsappServicePhone ||
        data.whatsappPhone ||
        data.whatsapp ||
        null
      );
      const whatsapp = whatsappRaw ? whatsappRaw : (phone ? phone : null);
      
      const logoUrl = normalizeString(
        data.logoUrl ||
        data.logo ||
        data.photoUrl ||
        data.profileImageUrl ||
        null
      );
      
      const city = normalizeString(
        data.city ||
        data.addressCity ||
        null
      );
      
      const address = normalizeString(
        data.address ||
        data.streetAddress ||
        null
      );
      
      resolvedProfile = { name, phone, whatsapp, logoUrl, city, address };
      
      // Build missing fields
      if (!name) missing.push('name');
      if (!phone) missing.push('phone');
      if (!whatsapp) missing.push('whatsapp');
      if (!logoUrl) missing.push('logoUrl');
      if (!city) missing.push('city');
      if (!address) missing.push('address');
      
      detectedKeys = {
        hasDisplayName: Boolean(data.displayName),
        hasFullName: Boolean(data.fullName),
        hasBusinessName: Boolean(data.businessName || data.companyName),
        hasPhone: Boolean(data.phone || data.phoneNumber || data.mobile),
        hasWhatsapp: Boolean(data.whatsapp || data.whatsappPhone),
        hasLogo: Boolean(data.logoUrl || data.logo),
        hasCity: Boolean(data.city),
        hasAddress: Boolean(data.address),
        hasWebsite: Boolean(data.website),
      };
    }
    
    // Load admin exposure config
    let adminExposure: {
      exists: boolean;
      showNameInBadge?: boolean;
      showLogo?: boolean;
      showPhone?: boolean;
      showWhatsapp?: boolean;
      showCity?: boolean;
      showAddress?: boolean;
    } = { exists: false };
    
    try {
      const exposure = await loadAdminSellerExposure(sellerUid);
      if (exposure) {
        adminExposure = {
          exists: true,
          showNameInBadge: exposure.showNameInBadge,
          showLogo: exposure.showLogo,
          showPhone: exposure.showPhone,
          showWhatsapp: exposure.showWhatsapp,
          showCity: exposure.showCity,
          showAddress: exposure.showAddress,
        };
      }
    } catch (error) {
      // Silently continue
    }
    
    return {
      success: true,
      sellerUid,
      sellerType,
      resolvedProfile,
      sourcesTried,
      detectedKeys,
      missing,
      adminExposure,
    };
  }
);
