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
 * adminDebugSearchYards: Search yards by name only
 * 
 * Searches users collection for yards (isYard=true or primaryRole='YARD')
 * by displayName/fullName/yardName/businessName.
 * 
 * Auth: Admin only
 * Returns: { ok: true, results: [{ yardUid, yardName, city? }] }
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

  const { q = '', limit = 15 } = data;
  
  // Enforce max limit
  const maxLimit = 50;
  const actualLimit = Math.min(Math.max(1, limit), maxLimit);
  
  // Normalize query: trim and lowercase for comparison
  const normalizedQuery = q.trim().toLowerCase();
  
  if (normalizedQuery.length === 0) {
    return { ok: true, results: [] };
  }

  try {
    // Query users where isYard=true OR primaryRole='YARD'
    // We'll fetch a reasonable batch and filter in-memory by name
    const usersRef = db.collection("users");
    
    // Get all yard users (we'll filter by name in-memory since Firestore doesn't support
    // case-insensitive text search without indexes)
    const yardQuery = usersRef
      .where("isYard", "==", true)
      .limit(200); // Fetch up to 200, then filter
    
    const snapshot = await yardQuery.get();
    
    const results: Array<{
      yardUid: string;
      yardName: string;
      city?: string;
    }> = [];
    
    for (const doc of snapshot.docs) {
      if (results.length >= actualLimit) break;
      
      const data = doc.data();
      const uid = doc.id;
      
      // Extract yard name (priority: displayName > fullName > yardName > businessName > companyName > name)
      const yardName = data.displayName || 
                      data.fullName || 
                      data.yardName || 
                      data.businessName || 
                      data.companyName || 
                      data.name || 
                      '';
      
      // Check if name matches query (case-insensitive contains)
      const nameLower = yardName.toLowerCase();
      if (nameLower.includes(normalizedQuery)) {
        results.push({
          yardUid: uid,
          yardName: yardName || uid, // Fallback to UID if no name
          city: data.city || undefined,
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
        if (results.some(r => r.yardUid === uid)) continue;
        
        const data = doc.data();
        const yardName = data.displayName || 
                        data.fullName || 
                        data.yardName || 
                        data.businessName || 
                        data.companyName || 
                        data.name || 
                        '';
        
        const nameLower = yardName.toLowerCase();
        if (nameLower.includes(normalizedQuery)) {
          results.push({
            yardUid: uid,
            yardName: yardName || uid,
            city: data.city || undefined,
          });
        }
      }
    }
    
    // Sort by name (alphabetical)
    results.sort((a, b) => a.yardName.localeCompare(b.yardName));
    
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
 * adminDebugSearchCars: Search cars by plate number / make / model / year
 * 
 * If yardUid provided: searches users/{yardUid}/carSales
 * Else: searches publicCars (sample)
 * 
 * Auth: Admin only
 * Returns: { ok: true, results: [{ carId, yardUid, plateNumber?, make?, model?, year?, title? }] }
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

  const { q = '', yardUid, limit = 15 } = data;
  
  // Enforce max limit
  const maxLimit = 50;
  const actualLimit = Math.min(Math.max(1, limit), maxLimit);
  
  // Normalize query: extract digits only for plate search
  const queryDigits = q.replace(/[^0-9]/g, '');
  const normalizedQuery = q.trim().toLowerCase();
  
  if (normalizedQuery.length === 0) {
    return { ok: true, results: [] };
  }

  try {
    const results: Array<{
      carId: string;
      yardUid: string;
      plateNumber?: string;
      make?: string;
      model?: string;
      year?: number;
      title?: string;
    }> = [];
    
    if (yardUid) {
      // Search in users/{yardUid}/carSales
      const carSalesRef = db
        .collection("users")
        .doc(yardUid)
        .collection("carSales");
      
      // Fetch limited docs and filter in-memory
      const snapshot = await carSalesRef.limit(200).get();
      
      for (const doc of snapshot.docs) {
        if (results.length >= actualLimit) break;
        
        const carData = doc.data();
        const carId = doc.id;
        
        // Extract plate (licensePlatePartial)
        const plate = carData.licensePlatePartial || '';
        const plateDigits = plate.replace(/[^0-9]/g, '');
        
        // Extract make/model
        const make = carData.brand || carData.brandText || '';
        const model = carData.model || carData.modelText || '';
        const year = carData.year || null;
        
        // Build title for display
        const titleParts: string[] = [];
        if (make) titleParts.push(make);
        if (model) titleParts.push(model);
        if (year) titleParts.push(String(year));
        const title = titleParts.join(' ') || carId;
        
        // Match by plate digits OR make/model/year text
        const matchesPlate = queryDigits.length > 0 && plateDigits.includes(queryDigits);
        const matchesText = normalizedQuery.length > 0 && (
          make.toLowerCase().includes(normalizedQuery) ||
          model.toLowerCase().includes(normalizedQuery) ||
          (year && String(year).includes(normalizedQuery))
        );
        
        if (matchesPlate || matchesText) {
          results.push({
            carId,
            yardUid,
            plateNumber: plate || undefined,
            make: make || undefined,
            model: model || undefined,
            year: year || undefined,
            title: title || undefined,
          });
        }
      }
    } else {
      // Search in publicCars (sample)
      const publicCarsRef = db.collection("publicCars");
      const snapshot = await publicCarsRef.limit(200).get();
      
      for (const doc of snapshot.docs) {
        if (results.length >= actualLimit) break;
        
        const carData = doc.data();
        const carId = doc.id;
        const yardUidFromCar = carData.yardUid || '';
        
        // Extract plate
        const plate = carData.licensePlatePartial || '';
        const plateDigits = plate.replace(/[^0-9]/g, '');
        
        // Extract make/model
        const make = carData.brand || '';
        const model = carData.model || '';
        const year = carData.year || null;
        
        // Build title
        const titleParts: string[] = [];
        if (make) titleParts.push(make);
        if (model) titleParts.push(model);
        if (year) titleParts.push(String(year));
        const title = titleParts.join(' ') || carId;
        
        // Match by plate digits OR make/model/year text
        const matchesPlate = queryDigits.length > 0 && plateDigits.includes(queryDigits);
        const matchesText = normalizedQuery.length > 0 && (
          make.toLowerCase().includes(normalizedQuery) ||
          model.toLowerCase().includes(normalizedQuery) ||
          (year && String(year).includes(normalizedQuery))
        );
        
        if (matchesPlate || matchesText) {
          results.push({
            carId,
            yardUid: yardUidFromCar,
            plateNumber: plate || undefined,
            make: make || undefined,
            model: model || undefined,
            year: year || undefined,
            title: title || undefined,
          });
        }
      }
    }
    
    // Sort by plate number (if available) or title
    results.sort((a, b) => {
      if (a.plateNumber && b.plateNumber) {
        return a.plateNumber.localeCompare(b.plateNumber);
      }
      if (a.plateNumber) return -1;
      if (b.plateNumber) return 1;
      return (a.title || a.carId).localeCompare(b.title || b.carId);
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
