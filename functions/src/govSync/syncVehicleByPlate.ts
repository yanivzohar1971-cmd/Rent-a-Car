/**
 * HTTP (onRequest): syncVehicleByPlate
 * Syncs one vehicle with Ministry of Transport (data.gov.il) by plate.
 * CORS: setCors first so preflight never hits auth; OPTIONS → 204, then POST only.
 * Body: { plate: string, carId?: string }. Auth: Bearer <Firebase ID token>.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { syncVehicleInternal } from "./syncVehicleInternal";

const db = admin.firestore();

const ALLOWED_ORIGINS = new Set([
  "https://www.carexperts4u.com",
  "https://carexperts4u.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "https://carexpert-94faa.web.app",
  "https://yardsite.web.app",
]);

function setCors(req: functions.https.Request, res: functions.Response): void {
  const origin = req.headers.origin;
  const allowed = origin && ALLOWED_ORIGINS.has(origin);
  res.set("Access-Control-Allow-Origin", allowed ? origin : "https://www.carexperts4u.com");
  res.set("Access-Control-Allow-Credentials", "true");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Max-Age", "86400");
}

function normalizePlateToDigits(plate: string): string {
  return String(plate).replace(/\D/g, "");
}

function readJsonBody(req: functions.https.Request): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")));
    req.on("error", reject);
  });
}

export const syncVehicleByPlate = functions
  .region("us-central1")
  .https.onRequest(async (req, res) => {
    setCors(req, res);
    console.log("[syncVehicleByPlate] hit", {
      method: req.method,
      origin: req.headers.origin,
      hasAuth: !!req.headers.authorization,
    });

    if (req.method === "OPTIONS") {
      console.log("syncVehicleByPlate: OPTIONS preflight");
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ ok: false, error: "Missing or invalid Authorization header" });
      return;
    }

    try {
      let yardUid: string;
      try {
        const token = authHeader.slice(7);
        const decoded = await admin.auth().verifyIdToken(token);
        yardUid = decoded.uid;
      } catch {
        res.status(401).json({ ok: false, error: "Unauthorized" });
        return;
      }

      let data: { plate?: string; carId?: string };
      try {
        data = (await readJsonBody(req)) as { plate?: string; carId?: string };
      } catch {
        res.status(400).json({ ok: false, error: "Invalid JSON body" });
        return;
      }

      const { plate, carId } = data;
      if (!plate || typeof plate !== "string") {
        res.status(400).json({ ok: false, reason: "plate is required and must be a string" });
        return;
      }

      const plateDigits = normalizePlateToDigits(plate);
      if (!plateDigits) {
        res.status(200).json({ ok: false, reason: "INVALID_PLATE" });
        return;
      }

      let resolvedCarId = carId && typeof carId === "string" ? carId : null;

      if (!resolvedCarId) {
        const carSalesRef = db.collection("users").doc(yardUid).collection("carSales");
        const snapshot = await carSalesRef.get();
        for (const doc of snapshot.docs) {
          const d = doc.data();
          const docPlate = (d.licensePlatePartial || d.licensePlate || "").toString().replace(/\D/g, "");
          if (docPlate === plateDigits) {
            resolvedCarId = doc.id;
            break;
          }
        }
        if (!resolvedCarId) {
          res.status(200).json({ ok: false, reason: "CAR_NOT_FOUND" });
          return;
        }
      }

      const result = await syncVehicleInternal(yardUid, resolvedCarId, plate);
      res.status(200).json({ ok: result.ok, reason: result.reason, error: result.error });
      return;
    } catch (err) {
      functions.logger.warn("syncVehicleByPlate: unexpected error", { err });
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "Internal server error",
      });
      return;
    }
  });
