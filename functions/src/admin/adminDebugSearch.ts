/**
 * Admin Debug Search Callable Functions
 * 
 * Provides admin-only search functions for yards and cars.
 * Used by Admin Debug Console for autocomplete pickers.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Helper to check if user is admin.
 * Checks custom claim admin=true OR existence in config/admins collection.
 */
async function isAdmin(callerUid: string): Promise<boolean> {
  try {
    // Check custom claim first (preferred)
    const user = await admin.auth().getUser(callerUid);
    if (user.customClaims?.admin === true) {
      return true;
    }
    
    // Fallback to config/admins collection
    const adminDoc = await db.collection("config").doc("admins").get();
    if (!adminDoc.exists) {
      return false;
    }
    const data = adminDoc.data();
    const uids = (data?.uids as string[]) || [];
    return uids.includes(callerUid);
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

/**
 * adminDebugSearchYards: Search yards (min 3 chars)
 * 
 * Searches users collection for yards (isYard=true or primaryRole='YARD')
 * by displayName/email/phone/city using CONTAINS (string.includes).
 * 
 * Auth: Admin only
 * Returns: { ok: true, results: [{ uid, displayName, city, status, roleStatus }] }
 */
export async function adminDebugSearchYardsHandler(data: any, context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const callerIsAdmin = await isAdmin(callerUid);
  
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can access debug functions"
    );
  }

  const { q = '', limit = 20 } = data;
  
  // Enforce max limit (20 per requirements)
  const maxLimit = 20;
  const actualLimit = Math.min(Math.max(1, limit), maxLimit);
  
  // Normalize query: trim and lowercase for comparison
  const normalizedQuery = q.trim().toLowerCase();
  
  // Min 3 chars requirement
  if (normalizedQuery.length < 3) {
    return { ok: true, results: [] };
  }

  try {
    // Query users where isYard=true OR primaryRole='YARD'
    // We'll fetch a reasonable batch and filter in-memory by CONTAINS
    const usersRef = db.collection("users");
    
    // Get all yard users (we'll filter in-memory since Firestore doesn't support
    // case-insensitive CONTAINS search without indexes)
    const yardQuery = usersRef
      .where("isYard", "==", true)
      .limit(200); // Fetch up to 200, then filter
    
    const snapshot = await yardQuery.get();
    
    const results: Array<{
      uid: string;
      displayName: string;
      city: string | null;
      status: string | null;
      roleStatus: string | null;
    }> = [];
    
    for (const doc of snapshot.docs) {
      if (results.length >= actualLimit) break;
      
      const data = doc.data();
      const uid = doc.id;
      
      // Extract search fields
      const displayName = data.displayName || 
                         data.fullName || 
                         data.yardName || 
                         data.businessName || 
                         data.companyName || 
                         data.name || 
                         '';
      const email = data.email || '';
      const phone = data.phone || data.phoneNumber || data.mobile || '';
      const city = data.city || '';
      
      // CONTAINS search (case-insensitive)
      const displayNameLower = displayName.toLowerCase();
      const emailLower = email.toLowerCase();
      const phoneLower = phone.toLowerCase();
      const cityLower = city.toLowerCase();
      
      const matches = displayNameLower.includes(normalizedQuery) ||
                     emailLower.includes(normalizedQuery) ||
                     phoneLower.includes(normalizedQuery) ||
                     cityLower.includes(normalizedQuery);
      
      if (matches) {
        results.push({
          uid,
          displayName: displayName || uid,
          city: data.city || null,
          status: data.status || null,
          roleStatus: data.roleStatus || null,
        });
      }
    }
    
    // Also try primaryRole='YARD' if we didn't get enough results
    if (results.length < actualLimit) {
      const roleQuery = usersRef
        .where("primaryRole", "==", "YARD")
        .limit(200);
      
      const roleSnapshot = await roleQuery.get();
      
      for (const doc of roleSnapshot.docs) {
        if (results.length >= actualLimit) break;
        
        const uid = doc.id;
        // Skip if already in results
        if (results.some(r => r.uid === uid)) continue;
        
        const data = doc.data();
        const displayName = data.displayName || 
                           data.fullName || 
                           data.yardName || 
                           data.businessName || 
                           data.companyName || 
                           data.name || 
                           '';
        const email = data.email || '';
        const phone = data.phone || data.phoneNumber || data.mobile || '';
        const city = data.city || '';
        
        // CONTAINS search (case-insensitive)
        const displayNameLower = displayName.toLowerCase();
        const emailLower = email.toLowerCase();
        const phoneLower = phone.toLowerCase();
        const cityLower = city.toLowerCase();
        
        const matches = displayNameLower.includes(normalizedQuery) ||
                       emailLower.includes(normalizedQuery) ||
                       phoneLower.includes(normalizedQuery) ||
                       cityLower.includes(normalizedQuery);
        
        if (matches) {
          results.push({
            uid,
            displayName: displayName || uid,
            city: data.city || null,
            status: data.status || null,
            roleStatus: data.roleStatus || null,
          });
        }
      }
    }
    
    // Sort by displayName (alphabetical)
    results.sort((a, b) => a.displayName.localeCompare(b.displayName));
    
    return {
      ok: true,
      results: results.slice(0, actualLimit),
    };
  } catch (error: any) {
    console.error("Error in adminDebugSearchYards:", error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to search yards: ${error.message}`,
      { correlationId: data.correlationId }
    );
  }
}

export const adminDebugSearchYards = functions.https.onCall(adminDebugSearchYardsHandler);

/**
 * adminDebugSearchCars: Search cars (min 4 chars)
 * 
 * Searches plateNumber, externalId, carId using CONTAINS (string.includes).
 * Sources: publicCars + users/{yardUid}/carSales (MASTER)
 * 
 * Auth: Admin only
 * Returns: { ok: true, results: [{ carId, plateNumber, title, yardUid, source, isPublished }] }
 */
export async function adminDebugSearchCarsHandler(data: any, context: functions.https.CallableContext) {
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "User must be authenticated"
    );
  }

  const callerUid = context.auth.uid;
  const callerIsAdmin = await isAdmin(callerUid);
  
  if (!callerIsAdmin) {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Only admins can access debug functions"
    );
  }

  const { q = '', limit = 50 } = data;
  
  // Enforce max limit (50 per requirements)
  const maxLimit = 50;
  const actualLimit = Math.min(Math.max(1, limit), maxLimit);
  
  // Normalize query: trim and lowercase for comparison
  const normalizedQuery = q.trim().toLowerCase();
  
  // Min 4 chars requirement
  if (normalizedQuery.length < 4) {
    return { ok: true, results: [] };
  }

  try {
    const results: Array<{
      carId: string;
      plateNumber: string | null;
      title: string;
      yardUid: string | null;
      source: string;
      isPublished: boolean;
    }> = [];
    
    const seenCarIds = new Set<string>();
    
    // Source 1: Search in publicCars
    const publicCarsRef = db.collection("publicCars");
    const publicSnapshot = await publicCarsRef.limit(200).get();
    
    for (const doc of publicSnapshot.docs) {
      if (results.length >= actualLimit) break;
      
      const carData = doc.data();
      const carId = doc.id;
      
      // Extract search fields
      const plateNumber = carData.licensePlatePartial || '';
      const externalId = carData.externalId || carData.stockNumber || '';
      const carIdStr = carId;
      
      // Extract display fields
      const brand = carData.brand || '';
      const model = carData.model || '';
      const year = carData.year || null;
      
      // Build title for display
      const titleParts: string[] = [];
      if (brand) titleParts.push(brand);
      if (model) titleParts.push(model);
      if (year) titleParts.push(String(year));
      const title = titleParts.join(' ') || carId;
      
      // CONTAINS search (case-insensitive) on plateNumber, externalId, carId
      const plateNumberLower = plateNumber.toLowerCase();
      const externalIdLower = externalId.toLowerCase();
      const carIdLower = carIdStr.toLowerCase();
      
      const matches = plateNumberLower.includes(normalizedQuery) ||
                     externalIdLower.includes(normalizedQuery) ||
                     carIdLower.includes(normalizedQuery);
      
      if (matches) {
        seenCarIds.add(carId);
        results.push({
          carId,
          plateNumber: plateNumber || null,
          title,
          yardUid: carData.yardUid || null,
          source: 'publicCars',
          isPublished: carData.isPublished === true,
        });
      }
    }
    
    // Source 2: Search in users/{yardUid}/carSales (MASTER)
    // First get all yards to search their carSales
    if (results.length < actualLimit) {
      const usersRef = db.collection("users");
      const yardsQuery = usersRef.where("isYard", "==", true).limit(50); // Limit yards to search
      const yardsSnapshot = await yardsQuery.get();
      
      for (const yardDoc of yardsSnapshot.docs) {
        if (results.length >= actualLimit) break;
        
        const yardUid = yardDoc.id;
        const carSalesRef = db
          .collection("users")
          .doc(yardUid)
          .collection("carSales");
        
        const carSalesSnapshot = await carSalesRef.limit(100).get();
        
        for (const carDoc of carSalesSnapshot.docs) {
          if (results.length >= actualLimit) break;
          
          const carData = carDoc.data();
          const carId = carDoc.id;
          
          // Skip if already found in publicCars
          if (seenCarIds.has(carId)) continue;
          
          // Extract search fields
          const plateNumber = carData.licensePlatePartial || '';
          const externalId = carData.externalId || carData.stockNumber || '';
          const carIdStr = carId;
          
          // Extract display fields
          const brand = carData.brand || carData.brandText || '';
          const model = carData.model || carData.modelText || '';
          const year = carData.year || null;
          
          // Build title for display
          const titleParts: string[] = [];
          if (brand) titleParts.push(brand);
          if (model) titleParts.push(model);
          if (year) titleParts.push(String(year));
          const title = titleParts.join(' ') || carId;
          
          // CONTAINS search (case-insensitive) on plateNumber, externalId, carId
          const plateNumberLower = plateNumber.toLowerCase();
          const externalIdLower = externalId.toLowerCase();
          const carIdLower = carIdStr.toLowerCase();
          
          const matches = plateNumberLower.includes(normalizedQuery) ||
                         externalIdLower.includes(normalizedQuery) ||
                         carIdLower.includes(normalizedQuery);
          
          if (matches) {
            seenCarIds.add(carId);
            // Check if published
            const statusStr = String(carData?.status ?? '').trim().toLowerCase();
            const pubStr = String(carData?.publicationStatus ?? '').trim().toUpperCase();
            const isPublished = statusStr === 'published' || 
                               statusStr === 'publish' || 
                               pubStr === 'PUBLISHED' || 
                               pubStr === 'PUBLIC' || 
                               carData.isPublished === true;
            
            results.push({
              carId,
              plateNumber: plateNumber || null,
              title,
              yardUid,
              source: 'carSales',
              isPublished,
            });
          }
        }
      }
    }
    
    // Sort by plateNumber or title
    results.sort((a, b) => {
      if (a.plateNumber && b.plateNumber) {
        return a.plateNumber.localeCompare(b.plateNumber);
      }
      if (a.plateNumber) return -1;
      if (b.plateNumber) return 1;
      return a.title.localeCompare(b.title);
    });
    
    return {
      ok: true,
      results: results.slice(0, actualLimit),
    };
  } catch (error: any) {
    console.error("Error in adminDebugSearchCars:", error);
    throw new functions.https.HttpsError(
      "internal",
      `Failed to search cars: ${error.message}`,
      { correlationId: data.correlationId }
    );
  }
}

export const adminDebugSearchCars = functions.https.onCall(adminDebugSearchCarsHandler);
