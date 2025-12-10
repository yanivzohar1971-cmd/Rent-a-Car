import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as XLSX from "xlsx";
import { 
  upsertYardCarMaster, 
  buildYardCarMasterDataFromImportRow,
  generateCarIdFromImportRow 
} from "./cars/masterCarService";
import { upsertPublicCarFromMaster } from "./cars/publicCarProjection";
import type { ImportRowNormalized } from "./types/cars";

const db = admin.firestore();

/**
 * yardImportCreateJob: Create a new import job for yard fleet Excel import
 */
export const yardImportCreateJob = functions.https.onCall(
  async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const yardUid = context.auth.uid;
    const { fileName } = data;

    // Validate input
    if (!fileName || typeof fileName !== "string" || fileName.trim() === "") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "fileName is required and must be a non-empty string"
      );
    }

    try {
      // Resolve yard registry entry to get importer configuration
      let importerId = "default-yard-excel-v1";
      let importerVersion = 1;

      try {
        const yardRegistryDoc = await db.collection("yards").doc(yardUid).get();
        if (yardRegistryDoc.exists) {
          const registryData = yardRegistryDoc.data();
          const importProfile = registryData?.importProfile;
          if (importProfile?.importerId) {
            importerId = importProfile.importerId;
          }
          if (importProfile?.importerVersion) {
            importerVersion = importProfile.importerVersion;
          }
        }
      } catch (error) {
        console.warn(
          `Could not load yard registry for ${yardUid}, using defaults:`,
          error
        );
        // Continue with defaults - don't fail the job creation
      }

      // Generate job ID (Firestore auto-ID)
      const jobRef = db
        .collection("users")
        .doc(yardUid)
        .collection("yardImportJobs")
        .doc();
      const jobId = jobRef.id;

      // Build storage path
      const storagePath = `yardImports/${yardUid}/${jobId}.xlsx`;

      // Create job document
      const now = admin.firestore.Timestamp.now();
      const jobData = {
        jobId: jobId,
        createdAt: now,
        createdBy: yardUid,
        status: "UPLOADED",
        source: {
          storagePath: storagePath,
          fileName: fileName.trim(),
          importerId: importerId,
          importerVersion: importerVersion,
        },
        summary: {
          rowsTotal: 0,
          rowsValid: 0,
          rowsWithWarnings: 0,
          rowsWithErrors: 0,
          carsToCreate: 0,
          carsToUpdate: 0,
          carsSkipped: 0,
          carsProcessed: 0,
        },
        updatedAt: now,
      };

      await jobRef.set(jobData);

      console.log(
        `Created yard import job ${jobId} for user ${yardUid}, storagePath: ${storagePath}`
      );

      return {
        jobId: jobId,
        uploadPath: storagePath,
      };
    } catch (error: any) {
      console.error("Error creating yard import job:", error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to create import job",
        error
      );
    }
  }
);

/**
 * Storage trigger: Parse Excel file and create preview rows
 * 
 * Triggered when a file is uploaded to Storage at: yardImports/{yardUid}/{jobId}.xlsx
 * This function:
 * 1. Downloads the Excel file from Storage
 * 2. Parses it and normalizes the data
 * 3. Creates preview rows in users/{yardUid}/yardImportJobs/{jobId}/preview
 * 4. Updates the job document with status PREVIEW_READY and summary counts
 */
export const yardImportParseExcel = functions.storage
  .object()
  .onFinalize(async (object) => {
    // Log trigger invocation with full details
    console.log("[YardImportParseExcel] Trigger invoked:", {
      bucket: object.bucket,
      name: object.name,
      contentType: object.contentType,
      size: object.size,
      timeCreated: object.timeCreated,
      metadata: object.metadata,
    });

    const filePath = object.name;
    if (!filePath) {
      console.error("[YardImportParseExcel] No file path in object, skipping");
      return;
    }

    // Only process yard import files
    if (!filePath.startsWith("yardImports/")) {
      console.log(`[YardImportParseExcel] File path does not start with 'yardImports/': ${filePath}, skipping`);
      return;
    }

    // Extract yardUid and jobId from path: yardImports/{yardUid}/{jobId}.xlsx
    const pathParts = filePath.split("/");
    if (pathParts.length !== 3) {
      console.error(`[YardImportParseExcel] Invalid path format (expected 3 parts): ${filePath}, parts:`, pathParts);
      return;
    }

    if (!pathParts[2].endsWith(".xlsx")) {
      console.error(`[YardImportParseExcel] File does not end with .xlsx: ${filePath}`);
      return;
    }

    const yardUid = pathParts[1];
    const jobId = pathParts[2].replace(".xlsx", "");

    console.log("[YardImportParseExcel] Starting processing:", {
      jobId,
      yardUid,
      filePath,
      bucket: object.bucket,
      size: object.size,
      contentType: object.contentType,
    });

    const jobRef = db
      .collection("users")
      .doc(yardUid)
      .collection("yardImportJobs")
      .doc(jobId);

    const jobDocPath = `users/${yardUid}/yardImportJobs/${jobId}`;
    console.log(`[YardImportParseExcel] Job document path: ${jobDocPath}`);

    try {
      // Load job document
      console.log(`[YardImportParseExcel] Loading job document: ${jobDocPath}`);
      const jobDoc = await jobRef.get();
      if (!jobDoc.exists) {
        console.error(`[YardImportParseExcel] Job document not found: ${jobDocPath}`);
        // Try to create a minimal job doc with error status
        try {
          await jobRef.set({
            jobId: jobId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: yardUid,
            status: "FAILED",
            error: {
              message: `Job document not found when processing uploaded file. File path: ${filePath}`,
            },
            source: {
              storagePath: filePath,
            },
            summary: {
              rowsTotal: 0,
              rowsValid: 0,
              rowsWithWarnings: 0,
              rowsWithErrors: 0,
              carsToCreate: 0,
              carsToUpdate: 0,
              carsSkipped: 0,
              carsProcessed: 0,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          console.log(`[YardImportParseExcel] Created error job document: ${jobDocPath}`);
        } catch (createError) {
          console.error(`[YardImportParseExcel] Failed to create error job document:`, createError);
        }
        return;
      }

      const jobData = jobDoc.data();
      if (!jobData) {
        console.error(`[YardImportParseExcel] Job document exists but has no data: ${jobDocPath}`);
        return;
      }

      console.log(`[YardImportParseExcel] Job document loaded:`, {
        jobId: jobData.jobId,
        status: jobData.status,
        createdAt: jobData.createdAt,
        source: jobData.source,
      });

      // Check if job is in correct status
      if (jobData.status !== "UPLOADED") {
        console.log(
          `[YardImportParseExcel] Job ${jobId} is not in UPLOADED status (current: ${jobData.status}), skipping. This is normal if the job was already processed or is in a different state.`
        );
        return;
      }

      // Update status to processing
      console.log(`[YardImportParseExcel] Updating job ${jobId} to PROCESSING status`);
      await jobRef.update({
        status: "PROCESSING",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Download file from Storage
      console.log(`[YardImportParseExcel] Downloading file from Storage: bucket=${object.bucket}, path=${filePath}`);
      const bucket = admin.storage().bucket(object.bucket);
      const file = bucket.file(filePath);
      
      let fileBuffer: Buffer;
      try {
        [fileBuffer] = await file.download();
        console.log(`[YardImportParseExcel] File downloaded successfully, size: ${fileBuffer.length} bytes`);
      } catch (downloadError: any) {
        console.error(`[YardImportParseExcel] Failed to download file:`, {
          error: downloadError,
          message: downloadError?.message,
          code: downloadError?.code,
          bucket: object.bucket,
          path: filePath,
        });
        throw new Error(`Failed to download file from Storage: ${downloadError?.message || 'Unknown error'}`);
      }

      // Parse Excel file
      console.log(`[YardImportParseExcel] Parsing Excel file...`);
      let workbook: XLSX.WorkBook;
      try {
        workbook = XLSX.read(fileBuffer, { type: "buffer" });
        console.log(`[YardImportParseExcel] Excel file parsed successfully, sheets:`, workbook.SheetNames);
      } catch (parseError: any) {
        console.error(`[YardImportParseExcel] Failed to parse Excel file:`, {
          error: parseError,
          message: parseError?.message,
          fileSize: fileBuffer.length,
        });
        throw new Error(`Failed to parse Excel file: ${parseError?.message || 'Unknown error'}`);
      }

      const sheetName = workbook.SheetNames[0]; // Use first sheet
      if (!sheetName) {
        throw new Error("Excel file has no sheets");
      }
      console.log(`[YardImportParseExcel] Using sheet: ${sheetName}`);
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON (first row is headers)
      let jsonData: any[];
      try {
        jsonData = XLSX.utils.sheet_to_json(worksheet, {
          raw: false, // Convert everything to strings for easier processing
        });
        console.log(`[YardImportParseExcel] Converted Excel to JSON: ${jsonData.length} rows`);
      } catch (convertError: any) {
        console.error(`[YardImportParseExcel] Failed to convert Excel to JSON:`, {
          error: convertError,
          message: convertError?.message,
        });
        throw new Error(`Failed to convert Excel to JSON: ${convertError?.message || 'Unknown error'}`);
      }

      if (jsonData.length === 0) {
        throw new Error("Excel file is empty or has no data rows");
      }

      // Get headers (first row keys)
      const headers = Object.keys(jsonData[0] || {});
      console.log(`[YardImportParseExcel] Parsed ${jsonData.length} rows for job ${jobId}, headers (${headers.length}):`, headers);

      // Normalize header names (trim whitespace)
      const normalizedHeaders: Record<string, string> = {};
      headers.forEach((h) => {
        normalizedHeaders[h.trim()] = h;
      });

      // Column mapping helper - tries to find Hebrew/English column names
      const findColumn = (
        patterns: string[]
      ): string | null => {
        for (const pattern of patterns) {
          for (const header of headers) {
            const normalized = header.trim();
            if (
              normalized.toLowerCase().includes(pattern.toLowerCase()) ||
              normalized === pattern
            ) {
              return header;
            }
          }
        }
        return null;
      };

      // Map known columns
      const licenseColumn = findColumn([
        "מספר רכב",
        "לוחית",
        "רישוי",
        "מספר רישוי",
        "license",
        "plate",
      ]);
      const manufacturerColumn = findColumn([
        "יצרן",
        "manufacturer",
        "brand",
      ]);
      const modelColumn = findColumn(["דגם", "model"]);
      const yearColumn = findColumn([
        "שנת יצור",
        "שנה",
        "year",
        "yearOfManufacture",
      ]);
      const mileageColumn = findColumn([
        'ק"מ',
        "קמ",
        'מד ק"מ',
        "מד קמ",
        "מד אוץ",
        "מד מרחק",
        "מד קילומטראז",
        "קילומטראז",
        "קילומטראז'",
        "ספידומטר",
        "km",
        "mileage",
        "odometer",
      ]);
      const gearColumn = findColumn([
        "תיבת הילוכים",
        "גיר",
        "gearbox",
        "gear",
        "transmission",
      ]);
      const colorColumn = findColumn(["צבע", "color"]);
      const engineCcColumn = findColumn([
        "נפח מנוע",
        "engine",
        "cc",
        "engineCc",
      ]);
      const ownershipColumn = findColumn([
        "מקוריות",
        "ownership",
        "source",
      ]);
      const testUntilColumn = findColumn([
        "טסט בתוקף עד",
        "test",
        "testUntil",
      ]);
      const handColumn = findColumn(["יד", "hand"]);
      const trimColumn = findColumn(["תת דגם", "trim"]);
      const askPriceColumn = findColumn(["מחיר נדרש", "מחיר", "price", "askPrice"]);
      const listPriceColumn = findColumn([
        "מחיר מחירון",
        "listPrice",
        "catalogPrice",
      ]);

      // Process each row
      const previewRows: any[] = [];
      let rowsValid = 0;
      let rowsWithWarnings = 0;
      let rowsWithErrors = 0;
      let processedRows = 0;
      const totalRows = jsonData.length;

      for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
        const row = jsonData[rowIndex];
        const raw: Record<string, any> = {};

        // Build raw map
        headers.forEach((header) => {
          raw[header] = row[header] ?? null;
        });

        // Normalize data
        const normalized: any = {};
        const issues: any[] = [];

        // License plate
        const licenseRaw = licenseColumn ? (row[licenseColumn] as string) : null;
        if (licenseRaw) {
          normalized.license = String(licenseRaw).trim();
          // Clean license: digits only for dedupe
          normalized.licenseClean = normalized.license.replace(/\D/g, "");
        }

        // Manufacturer
        const manufacturerRaw = manufacturerColumn
          ? (row[manufacturerColumn] as string)
          : null;
        if (manufacturerRaw) {
          normalized.manufacturer = String(manufacturerRaw).trim();
        }

        // Model
        const modelRaw = modelColumn ? (row[modelColumn] as string) : null;
        if (modelRaw) {
          let model = String(modelRaw).trim();
          // If model starts with manufacturer name, strip it
          if (normalized.manufacturer && model.startsWith(normalized.manufacturer)) {
            model = model.substring(normalized.manufacturer.length).trim();
          }
          normalized.model = model;
        }

        // Year
        if (yearColumn && row[yearColumn]) {
          const yearStr = String(row[yearColumn]).trim();
          const yearNum = parseInt(yearStr, 10);
          if (!isNaN(yearNum) && yearNum > 1900 && yearNum <= new Date().getFullYear() + 1) {
            normalized.year = yearNum;
          } else {
            issues.push({
              level: "WARNING",
              code: "INVALID_YEAR",
              message: `Invalid year: ${yearStr}`,
            });
          }
        }

        // Mileage
        if (mileageColumn && row[mileageColumn]) {
          const mileageStr = String(row[mileageColumn]).trim().replace(/,/g, "");
          const mileageNum = parseInt(mileageStr, 10);
          if (!isNaN(mileageNum) && mileageNum >= 0) {
            normalized.mileage = mileageNum;
          } else {
            issues.push({
              level: "WARNING",
              code: "INVALID_MILEAGE",
              message: `Invalid mileage: ${mileageStr}`,
            });
          }
        }

        // Gear
        if (gearColumn && row[gearColumn]) {
          const gearStr = String(row[gearColumn]).trim().toLowerCase();
          if (gearStr.includes("אוטו") || gearStr.includes("automatic") || gearStr.includes("auto")) {
            normalized.gear = "AUTOMATIC";
          } else {
            normalized.gear = gearStr; // Keep raw if not recognized
          }
        }

        // Color
        if (colorColumn && row[colorColumn]) {
          normalized.color = String(row[colorColumn]).trim();
        }

        // Engine CC
        if (engineCcColumn && row[engineCcColumn]) {
          const ccStr = String(row[engineCcColumn]).trim().replace(/,/g, "");
          const ccNum = parseInt(ccStr, 10);
          if (!isNaN(ccNum) && ccNum > 0) {
            normalized.engineCc = ccNum;
          }
        }

        // Ownership
        if (ownershipColumn && row[ownershipColumn]) {
          const ownershipStr = String(row[ownershipColumn]).trim().toLowerCase();
          if (ownershipStr.includes("פרטי")) {
            normalized.ownership = "PRIVATE";
          } else if (ownershipStr.includes("ליסינג")) {
            normalized.ownership = "LEASING_0KM";
          } else {
            normalized.ownership = ownershipStr;
          }
        }

        // Test until (date)
        if (testUntilColumn && row[testUntilColumn]) {
          try {
            // Try to parse date
            const dateStr = String(row[testUntilColumn]).trim();
            const date = new Date(dateStr);
            if (!isNaN(date.getTime())) {
              // Format as ISO date string YYYY-MM-DD
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, "0");
              const day = String(date.getDate()).padStart(2, "0");
              normalized.testUntil = `${year}-${month}-${day}`;
            }
          } catch (e) {
            // Ignore date parsing errors
          }
        }

        // Hand
        if (handColumn && row[handColumn]) {
          const handStr = String(row[handColumn]).trim();
          const handNum = parseInt(handStr, 10);
          if (!isNaN(handNum) && handNum > 0) {
            normalized.hand = handNum;
          }
        }

        // Trim
        if (trimColumn && row[trimColumn]) {
          normalized.trim = String(row[trimColumn]).trim();
        }

        // Ask price
        if (askPriceColumn && row[askPriceColumn]) {
          const priceStr = String(row[askPriceColumn]).trim().replace(/,/g, "").replace(/₪/g, "").replace(/\$/g, "");
          const priceNum = parseInt(priceStr, 10);
          if (!isNaN(priceNum) && priceNum >= 0) {
            normalized.askPrice = priceNum;
          }
        }

        // List price
        if (listPriceColumn && row[listPriceColumn]) {
          const priceStr = String(row[listPriceColumn]).trim().replace(/,/g, "").replace(/₪/g, "").replace(/\$/g, "");
          const priceNum = parseInt(priceStr, 10);
          if (!isNaN(priceNum) && priceNum >= 0) {
            normalized.listPrice = priceNum;
          }
        }

        // Validation: Check for required fields
        if (!normalized.licenseClean || normalized.licenseClean === "") {
          issues.push({
            level: "ERROR",
            code: "MISSING_KEY",
            message: "License plate is required",
          });
        }

        if (!normalized.manufacturer || normalized.manufacturer === "") {
          issues.push({
            level: "ERROR",
            code: "MISSING_KEY",
            message: "Manufacturer is required",
          });
        }

        // Determine if row is valid (no blocking errors)
        const hasErrors = issues.some((issue) => issue.level === "ERROR");
        const isValid = !hasErrors;

        if (isValid) {
          rowsValid++;
        }
        if (hasErrors) {
          rowsWithErrors++;
        } else if (issues.length > 0) {
          rowsWithWarnings++;
        }

        // Build dedupe key
        const dedupeKey = `${yardUid}|${normalized.licenseClean || ""}|${normalized.year || ""}`;

        // Create preview row document
        const previewRow = {
          rowIndex: rowIndex + 1, // 1-based index
          raw: raw,
          normalized: normalized,
          issues: issues,
          dedupeKey: dedupeKey,
        };

        previewRows.push(previewRow);
        
        // Update progress every 10 rows or on last row
        processedRows++;
        if (processedRows % 10 === 0 || processedRows === totalRows) {
          await jobRef.update({
            "summary.rowsTotal": totalRows,
            "summary.carsProcessed": processedRows,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // Write preview rows to Firestore
      const previewCollection = jobRef.collection("preview");
      const batch = db.batch();

      previewRows.forEach((row) => {
        const rowId = String(row.rowIndex).padStart(4, "0");
        const rowRef = previewCollection.doc(rowId);
        batch.set(rowRef, row);
      });

      await batch.commit();

      console.log(
        `Wrote ${previewRows.length} preview rows for job ${jobId}`
      );

      // Update job with summary and status
      const finalSummary = {
        rowsTotal: rowsValid + rowsWithWarnings + rowsWithErrors,
        rowsValid: rowsValid,
        rowsWithWarnings: rowsWithWarnings,
        rowsWithErrors: rowsWithErrors,
        carsToCreate: rowsValid, // Will be refined during commit
        carsToUpdate: 0,
        carsSkipped: rowsWithErrors,
        carsProcessed: 0,
      };

      console.log(`[YardImportParseExcel] Updating job ${jobId} to PREVIEW_READY with summary:`, finalSummary);
      
      await jobRef.update({
        status: "PREVIEW_READY",
        summary: finalSummary,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `[YardImportParseExcel] Successfully processed yard import job ${jobId}: ${rowsValid} valid rows, ${rowsWithWarnings} warnings, ${rowsWithErrors} errors. Total preview rows written: ${previewRows.length}`
      );
    } catch (error: any) {
      console.error(`[YardImportParseExcel][ERROR] Error processing yard import job ${jobId}:`, {
        error,
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
        code: error?.code,
        jobId,
        yardUid,
        filePath,
      });

      // Update job with error status
      try {
        await jobRef.update({
          status: "FAILED",
          error: {
            message: error?.message || "Unknown error during Excel parsing",
            code: error?.code || "UNKNOWN_ERROR",
            stack: error?.stack || undefined,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`[YardImportParseExcel] Updated job ${jobId} to FAILED status with error message`);
      } catch (updateError: any) {
        console.error(`[YardImportParseExcel][ERROR] Failed to update job with error status:`, {
          error: updateError,
          message: updateError?.message,
          jobId,
          yardUid,
        });
      }
    }
  }
);

/**
 * yardImportCommitJob: Commit the import job and create/update cars in Firestore
 * 
 * NOTE: This function creates CarSale documents in Firestore at users/{uid}/carSales/{carSaleId}.
 * These documents must sync to Room database on Android for them to appear in YardFleetScreen.
 * 
 * YardFleetScreen reads from YardFleetRepository -> CarSaleRepository -> Room CarSale table.
 * The Firestore documents written here should sync back to Room via the app's sync mechanism.
 * 
 * IMPORTANT: Ensure CarSale documents are written with correct schema matching Room entity
 * so they sync properly and appear in the Yard Fleet screen after commit.
 */
export const yardImportCommitJob = functions.https.onCall(
  async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    const yardUid = context.auth.uid;
    const { jobId } = data;

    // Log function execution for debugging deployment verification
    console.log(
      `[yardImportCommitJob] START uid=${yardUid}, jobId=${jobId}, project=${process.env.GCLOUD_PROJECT || "unknown"}`
    );

    // Validate input
    if (!jobId || typeof jobId !== "string") {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "jobId is required"
      );
    }

    try {
      // Load job document
      const jobRef = db
        .collection("users")
        .doc(yardUid)
        .collection("yardImportJobs")
        .doc(jobId);
      const jobDoc = await jobRef.get();

      if (!jobDoc.exists) {
        throw new functions.https.HttpsError(
          "not-found",
          "Import job not found"
        );
      }

      const jobData = jobDoc.data();
      if (!jobData) {
        throw new functions.https.HttpsError(
          "not-found",
          "Import job has no data"
        );
      }

      // Check if job is ready to commit
      if (jobData.status !== "PREVIEW_READY") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          `Job is not ready to commit (current status: ${jobData.status})`
        );
      }

      // Load all preview rows
      const previewSnapshot = await jobRef.collection("preview").get();
      const previewRows = previewSnapshot.docs.map((doc) => doc.data());

      // Filter to valid rows only (rows with no blocking errors)
      const validRows = previewRows.filter((row) => {
        const hasErrors = row.issues?.some(
          (issue: any) => issue.level === "ERROR"
        );
        return !hasErrors;
      });

      console.log(
        `Committing job ${jobId}: ${validRows.length} valid rows out of ${previewRows.length} total`
      );

      const totalRows = previewRows.length;
      
      // Set status to COMMITTING and initialize progress before starting
      await jobRef.update({
        status: "COMMITTING",
        "summary.rowsTotal": totalRows,
        "summary.carsProcessed": 0,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Process each valid row
      let carsCreated = 0;
      let carsUpdated = 0;
      let carsProcessed = 0;
      const now = admin.firestore.Timestamp.now();

      // Reference to yard's car collection for querying existing cars
      const carSalesCollection = db
        .collection("users")
        .doc(yardUid)
        .collection("carSales");

      // Determine if auto-publish is enabled (from job config or default to false)
      const autoPublish = jobData.config?.autoPublish === true;

      for (const row of validRows) {
        const normalized: ImportRowNormalized = row.normalized || {};
        const licenseClean = normalized.licenseClean;

        if (!licenseClean || licenseClean === "") {
          console.warn(
            `Skipping row ${row.rowIndex}: no licenseClean`
          );
          continue;
        }

        try {
          // Query for existing car with same licenseClean
          const existingCarQuery = await carSalesCollection
            .where("licensePlatePartial", "==", licenseClean)
            .limit(1)
            .get();

          // Check if we're creating new or updating existing
          const isNewCar = existingCarQuery.empty;
          
          // Generate or retrieve car ID
          // Use string IDs to match web layer (YardCarMaster.id is string)
          let carId: string;
          if (isNewCar) {
            // Generate deterministic string ID for new car
            carId = generateCarIdFromImportRow(normalized, yardUid);
          } else {
            // Use existing car's document ID (preserve it)
            carId = existingCarQuery.docs[0].id;
          }

          // Determine initial status (draft by default, or published if auto-publish enabled)
          const initialStatus: 'draft' | 'published' | 'archived' = autoPublish ? 'published' : 'draft';

          // Build MASTER car data using centralized service
          const masterCarData = buildYardCarMasterDataFromImportRow(
            normalized,
            yardUid,
            carId,
            {
              status: initialStatus,
              importJobId: jobId,
              importedAt: now,
            }
          );

          // Upsert MASTER car document
          await upsertYardCarMaster(yardUid, carId, masterCarData);

          // If auto-publish is enabled, create PUBLIC projection
          if (autoPublish) {
            await upsertPublicCarFromMaster(yardUid, carId);
          }

          if (isNewCar) {
            console.log(
              `[yardImportCommitJob] Created MASTER car id=${carId}, license=${licenseClean}, brand=${normalized.manufacturer || ""}, model=${normalized.model || ""}, status=${initialStatus}`
            );
            carsCreated++;
          } else {
            console.log(
              `[yardImportCommitJob] Updated MASTER car id=${carId}, license=${licenseClean}, brand=${normalized.manufacturer || ""}, model=${normalized.model || ""}, status=${initialStatus}`
            );
            carsUpdated++;
          }

          // Increment progress counter
          carsProcessed++;

          // Update progress in job document (real-time progress for Android to observe)
          await jobRef.update({
            "summary.carsProcessed": carsProcessed,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        } catch (rowError: any) {
          console.error(
            `Error processing row ${row.rowIndex} for job ${jobId}:`,
            rowError
          );
          // Continue with other rows, but still increment processed counter
          carsProcessed++;
          await jobRef.update({
            "summary.carsProcessed": carsProcessed,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // Update job with final summary and status
      await jobRef.update({
        status: "COMMITTED",
        summary: {
          rowsTotal: jobData.summary?.rowsTotal || previewRows.length,
          rowsValid: jobData.summary?.rowsValid || validRows.length,
          rowsWithWarnings: jobData.summary?.rowsWithWarnings || 0,
          rowsWithErrors: jobData.summary?.rowsWithErrors || 0,
          carsToCreate: carsCreated,
          carsToUpdate: carsUpdated,
          carsSkipped:
            (jobData.summary?.rowsTotal || 0) - validRows.length,
          carsProcessed: carsProcessed,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `Successfully committed job ${jobId}: ${carsCreated} created, ${carsUpdated} updated`
      );

      return { ok: true };
    } catch (error: any) {
      console.error(`Error committing yard import job ${jobId}:`, error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Failed to commit import job",
        error
      );
    }
  }
);

