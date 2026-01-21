/**
 * Admin Debug: Inspect Public Car Document
 * 
 * Returns source-of-truth inspection of publicCars/{carId} document
 * without relying on web mapping.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Check if caller is admin
 */
async function isAdmin(callerUid: string): Promise<boolean> {
  try {
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
 * Admin callable to inspect publicCars document
 * Returns detailed diagnostic JSON for a given carId.
 */
export const adminDebugInspectPublicCar = functions.https.onCall(async (data, context) => {
  const correlationId = Math.random().toString(36).substring(2, 15);
  
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.", { correlationId });
  }
  
  if (!(await isAdmin(context.auth.uid))) {
    throw new functions.https.HttpsError("permission-denied", "Admin privileges required.", { correlationId });
  }

  const { carId } = data;

  if (!carId || typeof carId !== 'string') {
    throw new functions.https.HttpsError("invalid-argument", "carId is required and must be a string.", { correlationId });
  }

  try {
    const publicCarRef = db.collection('publicCars').doc(carId);
    const publicCarDoc = await publicCarRef.get();
    
    if (!publicCarDoc.exists) {
      return {
        carId,
        exists: false,
        correlationId,
        notes: ['Document does not exist in publicCars collection'],
      };
    }

    const publicCarData = publicCarDoc.data();
    if (!publicCarData) {
      return {
        carId,
        exists: true,
        correlationId,
        notes: ['Document exists but has no data'],
      };
    }

    // Extract all keys (for diagnostics, no sensitive data)
    const rawKeys = Object.keys(publicCarData).sort();

    // Check viewsCount
    const hasViewsCount = 'viewsCount' in publicCarData;
    const viewsCount = typeof publicCarData.viewsCount === 'number' ? publicCarData.viewsCount : null;

    // Check snapshots
    const hasSellerSnapshot = Boolean(
      publicCarData.sellerSnapshot && typeof publicCarData.sellerSnapshot === 'object' &&
      (publicCarData.sellerSnapshot.sellerName || 
       publicCarData.sellerSnapshot.sellerPhone || 
       publicCarData.sellerSnapshot.sellerLogoUrl)
    );
    const hasYardSnapshot = Boolean(
      publicCarData.yardSnapshot && typeof publicCarData.yardSnapshot === 'object' &&
      (publicCarData.yardSnapshot.yardName || 
       publicCarData.yardSnapshot.yardPhone || 
       publicCarData.yardSnapshot.yardLogoUrl)
    );

    // Check flat fields
    const hasFlatYardDisplayName = Boolean(publicCarData.yardDisplayName || publicCarData.yardName);
    const hasFlatYardLogoUrl = Boolean(publicCarData.yardLogoUrl);
    const hasFlatSellerDisplayName = Boolean(publicCarData.sellerDisplayName);
    const hasFlatSellerLogoUrl = Boolean(publicCarData.sellerLogoUrl);

    // Build snapshot preview (only public-safe fields)
    const snapshotPreview: any = {};
    
    if (publicCarData.yardSnapshot && typeof publicCarData.yardSnapshot === 'object') {
      snapshotPreview.yardName = publicCarData.yardSnapshot.yardName || null;
      snapshotPreview.yardLogoUrl = publicCarData.yardSnapshot.yardLogoUrl || null;
      snapshotPreview.yardPhone = publicCarData.yardSnapshot.yardPhone || null;
      snapshotPreview.yardWhatsappPhone = publicCarData.yardSnapshot.yardWhatsapp || publicCarData.yardSnapshot.yardWhatsappPhone || null;
    } else {
      // Fallback to flat fields
      snapshotPreview.yardName = publicCarData.yardName || publicCarData.yardDisplayName || null;
      snapshotPreview.yardLogoUrl = publicCarData.yardLogoUrl || null;
      snapshotPreview.yardPhone = publicCarData.yardPhone || null;
      snapshotPreview.yardWhatsappPhone = publicCarData.yardWhatsappPhone || null;
    }
    
    if (publicCarData.sellerSnapshot && typeof publicCarData.sellerSnapshot === 'object') {
      snapshotPreview.sellerName = publicCarData.sellerSnapshot.sellerName || null;
      snapshotPreview.sellerLogoUrl = publicCarData.sellerSnapshot.sellerLogoUrl || null;
      snapshotPreview.sellerPhone = publicCarData.sellerSnapshot.sellerPhone || null;
      snapshotPreview.sellerWhatsappPhone = publicCarData.sellerSnapshot.sellerWhatsapp || publicCarData.sellerSnapshot.sellerWhatsappPhone || null;
    } else {
      // Fallback to flat fields
      snapshotPreview.sellerName = publicCarData.sellerDisplayName || null;
      snapshotPreview.sellerLogoUrl = publicCarData.sellerLogoUrl || null;
      snapshotPreview.sellerPhone = publicCarData.sellerPhone || null;
      snapshotPreview.sellerWhatsappPhone = publicCarData.sellerWhatsappPhone || null;
    }

    // Build notes
    const notes: string[] = [];
    if (!hasViewsCount) {
      notes.push('viewsCount field is missing');
    } else if (viewsCount === null) {
      notes.push('viewsCount exists but is null (should be number)');
    }
    if (!hasSellerSnapshot && !hasFlatSellerDisplayName) {
      notes.push('No seller snapshot or flat seller fields found');
    }
    if (!hasYardSnapshot && !hasFlatYardDisplayName) {
      notes.push('No yard snapshot or flat yard fields found');
    }
    if (hasSellerSnapshot && !hasFlatSellerDisplayName) {
      notes.push('Has nested sellerSnapshot but missing flat sellerDisplayName (backward compatibility)');
    }
    if (hasYardSnapshot && !hasFlatYardDisplayName) {
      notes.push('Has nested yardSnapshot but missing flat yardDisplayName (backward compatibility)');
    }

    return {
      carId,
      exists: true,
      correlationId,
      publicCars: {
        hasViewsCount,
        viewsCount,
        hasSellerSnapshot,
        hasYardSnapshot,
        hasFlatYardDisplayName,
        hasFlatYardLogoUrl,
        hasFlatSellerDisplayName,
        hasFlatSellerLogoUrl,
        yardUid: publicCarData.yardUid || null,
        sellerType: publicCarData.sellerType || null,
      },
      rawKeys,
      snapshotPreview,
      notes: notes.length > 0 ? notes : ['All required fields present'],
    };
  } catch (error: any) {
    console.error(`[adminDebugInspectPublicCar] Error for ${carId}:`, error);
    throw new functions.https.HttpsError("internal", `Failed to inspect public car: ${error.message}`, { 
      correlationId, 
      originalError: error.message 
    });
  }
});
