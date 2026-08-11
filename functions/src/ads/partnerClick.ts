import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/**
 * Track partner ad click (no authentication required)
 * POST /trackPartnerClick
 * Body: { partnerId: string, placement?: string }
 */
export const trackPartnerClick = functions.https.onRequest(async (req, res) => {
  // CORS: Allow all origins (public tracking)
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  // Prevent caching
  res.set("Cache-Control", "no-store");

  // Handle preflight
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  // Only allow POST
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  try {
    // Parse JSON safely (handle string body)
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        res.status(400).json({ error: "Invalid JSON" });
        return;
      }
    }

    const { partnerId, placement } = body;

    // Validate partnerId is string and non-empty
    if (!partnerId || typeof partnerId !== "string" || partnerId.trim() === "") {
      res.status(400).json({ error: "partnerId is required" });
      return;
    }

    // Increment clicksTotal in rentalCompanies/{partnerId}
    // Use update with merge to avoid errors if doc doesn't exist
    const partnerRef = db.collection("rentalCompanies").doc(partnerId);
    try {
      await partnerRef.update({
        clicksTotal: admin.firestore.FieldValue.increment(1),
      });
    } catch (error: any) {
      // If doc doesn't exist, don't leak that info - just return 204
      if (error?.code === 5 || error?.code === "not-found") {
        res.status(204).send("");
        return;
      }
      throw error;
    }

    // Write daily stats
    const today = new Date();
    const dateStr = today.toISOString().split("T")[0]; // YYYY-MM-DD
    const docId = `${partnerId}_${dateStr.replace(/-/g, "")}`; // YYYYMMDD format

    const statsRef = db.collection("partnerAdStatsDaily").doc(docId);
    await statsRef.set(
      {
        partnerId,
        date: dateStr,
        clicks: admin.firestore.FieldValue.increment(1),
        lastPlacement: placement || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // Respond quickly (204 No Content)
    res.status(204).send("");
  } catch (error: any) {
    console.error("[trackPartnerClick] Error:", error);
    
    // Don't expose internal errors to client
    // Still return 204 to avoid breaking user experience
    res.status(204).send("");
  }
});
