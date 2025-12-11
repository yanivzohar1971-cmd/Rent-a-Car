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

// Centralized bucket name for Yard Excel imports - must match Web Firebase config
const YARD_STORAGE_BUCKET = "carexpert-94faa.firebasestorage.app";

/**
 * Internal helper: Parse Excel file buffer and return normalized rows with summary
 * This is shared logic used by both yardImportParseExcel (Storage trigger) and yardImportCommitJob (fallback)
 */
interface ParseExcelResult {
  previewRows: Array<{
    rowIndex: number;
    raw: Record<string, any>;
    normalized: any;
    issues: Array<{ level: string; code: string; message: string }>;
    dedupeKey: string;
  }>;
  summary: {
    rowsTotal: number;
    rowsValid: number;
    rowsWithWarnings: number;
    rowsWithErrors: number;
  };
}

async function parseExcelFileBuffer(
  fileBuffer: Buffer,
  yardUid: string,
  jobId: string,
  logPrefix: string = "[ParseExcel]"
): Promise<ParseExcelResult> {
  console.log(`${logPrefix} Parsing Excel file buffer, size: ${fileBuffer.length} bytes`);
  
  // Parse Excel file
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: "buffer" });
    console.log(`${logPrefix} Excel file parsed successfully, sheets:`, workbook.SheetNames);
  } catch (parseError: any) {
    console.error(`${logPrefix} Failed to parse Excel file:`, {
      error: parseError,
      message: parseError?.message,
      fileSize: fileBuffer.length,
    });
    throw new Error(`Failed to parse Excel file: ${parseError?.message || 'Unknown error'}`);
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excel file has no sheets");
  }
  console.log(`${logPrefix} Using sheet: ${sheetName}`);
  const worksheet = workbook.Sheets[sheetName];

  // Convert to JSON
  let jsonData: any[];
  try {
    jsonData = XLSX.utils.sheet_to_json(worksheet, {
      raw: false,
    });
    console.log(`${logPrefix} Converted Excel to JSON: ${jsonData.length} rows`);
  } catch (convertError: any) {
    console.error(`${logPrefix} Failed to convert Excel to JSON:`, {
      error: convertError,
      message: convertError?.message,
    });
    throw new Error(`Failed to convert Excel to JSON: ${convertError?.message || 'Unknown error'}`);
  }

  if (jsonData.length === 0) {
    throw new Error("Excel file is empty or has no data rows");
  }

  // Get headers
  const headers = Object.keys(jsonData[0] || {});
  console.log(`${logPrefix} Parsed ${jsonData.length} rows, headers (${headers.length}):`, headers);

  // Normalize header names
  const normalizedHeaders: Record<string, string> = {};
  headers.forEach((h) => {
    normalizedHeaders[h.trim()] = h;
  });

  // Column mapping helper
  const findColumn = (patterns: string[]): string | null => {
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

  // Map known columns (reuse existing logic)
  const licenseColumn = findColumn([
    "מספר רכב", "לוחית", "רישוי", "מספר רישוי", "license", "plate",
  ]);
  const manufacturerColumn = findColumn(["יצרן", "manufacturer", "brand"]);
  const modelColumn = findColumn(["דגם", "model"]);
  const yearColumn = findColumn(["שנת יצור", "שנה", "year", "yearOfManufacture"]);
  const mileageColumn = findColumn([
    'ק"מ', "קמ", 'מד ק"מ', "מד קמ", "מד אוץ", "מד מרחק", "מד קילומטראז",
    "קילומטראז", "קילומטראז'", "ספידומטר", "km", "mileage", "odometer",
  ]);
  const gearColumn = findColumn(["תיבת הילוכים", "גיר", "gearbox", "gear", "transmission"]);
  const colorColumn = findColumn(["צבע", "color"]);
  const engineCcColumn = findColumn(["נפח מנוע", "engine", "cc", "engineCc"]);
  const ownershipColumn = findColumn(["מקוריות", "ownership", "source"]);
  const testUntilColumn = findColumn(["טסט בתוקף עד", "test", "testUntil"]);
  const handColumn = findColumn(["יד", "hand"]);
  const trimColumn = findColumn(["תת דגם", "trim"]);
  const askPriceColumn = findColumn(["מחיר נדרש", "מחיר", "price", "askPrice"]);
  const listPriceColumn = findColumn(["מחיר מחירון", "listPrice", "catalogPrice"]);

  // Process each row
  const previewRows: any[] = [];
  let rowsValid = 0;
  let rowsWithWarnings = 0;
  let rowsWithErrors = 0;

  for (let rowIndex = 0; rowIndex < jsonData.length; rowIndex++) {
    const row = jsonData[rowIndex];
    const raw: Record<string, any> = {};

    // Build raw map
    headers.forEach((header) => {
      raw[header] = row[header] ?? null;
    });

    // Normalize data (reuse existing normalization logic)
    const normalized: any = {};
    const issues: any[] = [];

    // License plate
    const licenseRaw = licenseColumn ? (row[licenseColumn] as string) : null;
    if (licenseRaw) {
      normalized.license = String(licenseRaw).trim();
      normalized.licenseClean = normalized.license.replace(/\D/g, "");
    }

    // Manufacturer
    const manufacturerRaw = manufacturerColumn ? (row[manufacturerColumn] as string) : null;
    if (manufacturerRaw) {
      normalized.manufacturer = String(manufacturerRaw).trim();
    }

    // Model
    const modelRaw = modelColumn ? (row[modelColumn] as string) : null;
    if (modelRaw) {
      let model = String(modelRaw).trim();
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
        issues.push({ level: "WARNING", code: "INVALID_YEAR", message: `Invalid year: ${yearStr}` });
      }
    }

    // Mileage
    if (mileageColumn && row[mileageColumn]) {
      const mileageStr = String(row[mileageColumn]).trim().replace(/,/g, "");
      const mileageNum = parseInt(mileageStr, 10);
      if (!isNaN(mileageNum) && mileageNum >= 0) {
        normalized.mileage = mileageNum;
      } else {
        issues.push({ level: "WARNING", code: "INVALID_MILEAGE", message: `Invalid mileage: ${mileageStr}` });
      }
    }

    // Gear
    if (gearColumn && row[gearColumn]) {
      const gearStr = String(row[gearColumn]).trim().toLowerCase();
      if (gearStr.includes("אוטו") || gearStr.includes("automatic") || gearStr.includes("auto")) {
        normalized.gear = "AUTOMATIC";
      } else {
        normalized.gear = gearStr;
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

    // Test until
    if (testUntilColumn && row[testUntilColumn]) {
      try {
        const dateStr = String(row[testUntilColumn]).trim();
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, "0");
          const day = String(date.getDate()).padStart(2, "0");
          normalized.testUntil = `${year}-${month}-${day}`;
        }
      } catch (e) {
        // Ignore
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

    // Validation
    if (!normalized.licenseClean || normalized.licenseClean === "") {
      issues.push({ level: "ERROR", code: "MISSING_KEY", message: "License plate is required" });
    }
    if (!normalized.manufacturer || normalized.manufacturer === "") {
      issues.push({ level: "ERROR", code: "MISSING_KEY", message: "Manufacturer is required" });
    }

    // Determine validity
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

    // Create preview row
    previewRows.push({
      rowIndex: rowIndex + 1,
      raw: raw,
      normalized: normalized,
      issues: issues,
      dedupeKey: dedupeKey,
    });
  }

  const summary = {
    rowsTotal: rowsValid + rowsWithWarnings + rowsWithErrors,
    rowsValid: rowsValid,
    rowsWithWarnings: rowsWithWarnings,
    rowsWithErrors: rowsWithErrors,
  };

  console.log(`${logPrefix} Parsing complete: ${rowsValid} valid, ${rowsWithWarnings} warnings, ${rowsWithErrors} errors`);

  return { previewRows, summary };
}

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
    console.log("[yardImportParseExcel] Trigger invoked", {
      bucket: object.bucket,
      name: object.name,
      contentType: object.contentType,
      size: object.size,
      timeCreated: object.timeCreated,
      metadata: object.metadata,
    });

    const filePath = object.name || "";
    
    console.log('[yardImportParseExcel] Received finalize event for file:', {
      bucket: object.bucket,
      filePath,
    });
    
    // Quick validation - skip non-yardImports files early (no job to update)
    if (!filePath || !filePath.startsWith("yardImports/")) {
      console.log(`[yardImportParseExcel] Skipping non-yardImports file: ${filePath}`);
      return;
    }

    let yardUid: string | null = null;
    let jobId: string | null = null;
    let jobRef: admin.firestore.DocumentReference | null = null;

    try {
      // Extract yardUid and jobId from path: yardImports/{yardUid}/{jobId}.xlsx (or .xls, .csv)
      const pathParts = filePath.split("/");
      if (pathParts.length !== 3) {
        console.error('[yardImportParseExcel] Invalid yard import path structure', {
          filePath,
          parts: pathParts,
        });
        throw new Error(`Invalid path format (expected 3 parts): ${filePath}, parts: ${JSON.stringify(pathParts)}`);
      }

      const [, extractedYardUid, fileName] = pathParts;
      const extractedJobId = fileName.replace(/\.[^.]+$/, ''); // strip extension

      if (!extractedYardUid || !extractedJobId) {
        console.error('[yardImportParseExcel] Failed to parse yardUid/jobId from path', {
          filePath,
          yardUid: extractedYardUid,
          jobId: extractedJobId,
        });
        throw new Error(`Failed to parse yardUid/jobId from path: ${filePath}`);
      }

      // Accept .xlsx, .xls, or .csv extensions
      const validExtensions = [".xlsx", ".xls", ".csv"];
      const hasValidExtension = validExtensions.some(ext => fileName.endsWith(ext));
      
      if (!hasValidExtension) {
        throw new Error(`File does not have a valid extension (.xlsx, .xls, .csv): ${filePath}`);
      }

      yardUid = extractedYardUid;
      jobId = extractedJobId;

      console.log("[yardImportParseExcel] Parsed path", {
        yardUid,
        jobId,
        rawName: object.name,
        filePath,
      });

      // Get job reference early so we can update it on any error
      jobRef = db
        .collection("users")
        .doc(yardUid)
        .collection("yardImportJobs")
        .doc(jobId);

      const jobDocPath = `users/${yardUid}/yardImportJobs/${jobId}`;
      console.log(`[yardImportParseExcel] Job document path: ${jobDocPath}`);

      // Load job document
      console.log(`[yardImportParseExcel] Loading job document: ${jobDocPath}`);
      const jobDoc = await jobRef.get();
      
      if (!jobDoc.exists) {
        throw new Error(`Job document not found: ${jobDocPath}. File path: ${filePath}`);
      }

      const jobData = jobDoc.data();
      if (!jobData) {
        throw new Error(`Job document exists but has no data: ${jobDocPath}`);
      }

      console.log("[yardImportParseExcel] Loaded job document", {
        yardUid,
        jobId,
        exists: jobDoc.exists,
        status: jobData.status,
        createdAt: jobData.createdAt,
        source: jobData.source,
      });

      // Short-circuit if already processed (but log it)
      if (jobData.status === "PREVIEW_READY" || jobData.status === "COMMITTED") {
        console.log("[yardImportParseExcel] Job already processed, skipping", {
          yardUid,
          jobId,
          status: jobData.status,
        });
        return;
      }

      // If status is not UPLOADED, we still want to process it (might be PROCESSING from a retry)
      // But log a warning
      if (jobData.status !== "UPLOADED" && jobData.status !== "PROCESSING") {
        console.warn("[yardImportParseExcel] Job is not in UPLOADED/PROCESSING status, but will attempt to process", {
          yardUid,
          jobId,
          currentStatus: jobData.status,
        });
      }

      // Validate file size
      const fileSize = Number(object.size) || 0;
      if (fileSize === 0) {
        throw new Error(`Uploaded file is empty (size: ${object.size} bytes). Please upload a valid Excel/CSV file.`);
      }

      // Warn about unexpected content type but don't fail
      const validContentTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-excel", // .xls
        "text/csv",
        "application/csv",
      ];
      
      if (object.contentType && !validContentTypes.includes(object.contentType)) {
        console.warn(`[yardImportParseExcel] Unexpected content type: ${object.contentType} for file: ${filePath}. Will attempt to parse anyway.`);
      }

      // Update status to PROCESSING
      console.log("[yardImportParseExcel] Updating job status to PROCESSING", { yardUid, jobId });
      await jobRef.update({
        status: "PROCESSING",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Download file from Storage
      // CRITICAL: Explicitly use the correct bucket name to avoid bucket mismatch errors
      const bucket = admin.storage().bucket(YARD_STORAGE_BUCKET);
      console.log("[yardImportParseExcel] Using bucket for download:", {
        configuredBucket: bucket.name,
        explicitBucketName: YARD_STORAGE_BUCKET,
        eventBucket: object.bucket,
        filePath,
        bucketMatches: bucket.name === YARD_STORAGE_BUCKET,
      });
      const file = bucket.file(filePath);
      
      // Check if file exists before downloading
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`קובץ האקסל לא נמצא ב-Storage (נתיב: ${filePath}).`);
      }

      let fileBuffer: Buffer;
      try {
        [fileBuffer] = await file.download();
        console.log("[yardImportParseExcel] File downloaded", {
          yardUid,
          jobId,
          bufferLength: fileBuffer.length,
          contentType: object.contentType,
        });
        
        if (!fileBuffer || fileBuffer.length === 0) {
          throw new Error('קובץ האקסל ריק או לא נקרא.');
        }
      } catch (downloadError: any) {
        console.error(`[yardImportParseExcel] Failed to download file:`, {
          error: downloadError,
          message: downloadError?.message,
          code: downloadError?.code,
          bucket: bucket.name,
          path: filePath,
          fileSize: object.size,
        });
        throw new Error(`Failed to download file from Storage: ${downloadError?.message || 'Unknown error'}`);
      }

      // Parse Excel file using shared helper
      console.log(`[yardImportParseExcel] Parsing Excel file using shared helper...`);
      const parseResult = await parseExcelFileBuffer(
        fileBuffer,
        yardUid!,
        jobId!,
        "[yardImportParseExcel]"
      );

      const { previewRows, summary } = parseResult;
      const { rowsValid, rowsWithWarnings, rowsWithErrors } = summary;

      // Write preview rows to Firestore
      const previewCollection = jobRef!.collection("preview");
      const batch = db.batch();

      previewRows.forEach((row) => {
        const rowId = String(row.rowIndex).padStart(4, "0");
        const rowRef = previewCollection.doc(rowId);
        batch.set(rowRef, row);
      });

      await batch.commit();

      console.log(
        `[yardImportParseExcel] Wrote ${previewRows.length} preview rows for job ${jobId}`
      );

      // Update job with summary and status
      const finalSummary = {
        rowsTotal: summary.rowsTotal,
        rowsValid: summary.rowsValid,
        rowsWithWarnings: summary.rowsWithWarnings,
        rowsWithErrors: summary.rowsWithErrors,
        carsToCreate: summary.rowsValid, // Will be refined during commit
        carsToUpdate: 0,
        carsSkipped: summary.rowsWithErrors,
        carsProcessed: 0,
      };

      console.log("[yardImportParseExcel] Parsed summary", { yardUid, jobId, summary: finalSummary });

      // Update job to PREVIEW_READY
      console.log("[yardImportParseExcel] Updating job status to PREVIEW_READY", {
        yardUid,
        jobId,
        summary: finalSummary,
      });
      
      await jobRef!.update({
        status: "PREVIEW_READY",
        summary: finalSummary,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `[yardImportParseExcel] Successfully processed yard import job ${jobId}: ${rowsValid} valid rows, ${rowsWithWarnings} warnings, ${rowsWithErrors} errors. Total preview rows written: ${previewRows.length}`
      );
    } catch (error: any) {
      console.error("[yardImportParseExcel] Error while processing import", {
        yardUid,
        jobId,
        errorMessage: error?.message,
        stack: error?.stack,
        code: error?.code,
        filePath,
      });

      // CRITICAL: Always update job status to FAILED if we have a job reference
      // This ensures the job NEVER stays stuck at UPLOADED
      if (jobRef && yardUid && jobId) {
        try {
          const errorMessage = error?.message || "Unknown error during Excel parsing";
          console.log("[yardImportParseExcel] Updating job status to FAILED", {
            yardUid,
            jobId,
            errorMessage,
          });

          await jobRef.update({
            status: "FAILED",
            error: {
              message: errorMessage,
              code: error?.code || "UNKNOWN_ERROR",
              stack: error?.stack || undefined,
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          console.log(`[yardImportParseExcel] Updated job ${jobId} to FAILED status with error message`);
        } catch (updateError: any) {
          console.error(`[yardImportParseExcel][ERROR] Failed to update job with error status:`, {
            error: updateError,
            message: updateError?.message,
            jobId,
            yardUid,
            originalError: error?.message,
          });
        }
      } else {
        // If we don't have jobRef, we can't update the job, but log it clearly
        console.error("[yardImportParseExcel][CRITICAL] Cannot update job status - missing jobRef", {
          yardUid,
          jobId,
          hasJobRef: !!jobRef,
          errorMessage: error?.message,
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

      let jobData = jobDoc.data();
      if (!jobData) {
        throw new functions.https.HttpsError(
          "not-found",
          "Import job has no data"
        );
      }

      // Check if job needs inline parsing (fallback if Storage trigger didn't run)
      const needsParsing = 
        jobData.status === "UPLOADED" || 
        !jobData.summary || 
        jobData.summary.rowsTotal === 0;

      if (needsParsing) {
        console.log(
          `[yardImportCommitJob] Job ${jobId} is not ready (status: ${jobData.status}, rowsTotal: ${jobData.summary?.rowsTotal || 0}), performing inline Excel parse...`
        );

        // Get storage path from job
        const storagePath = jobData.source?.storagePath;
        if (!storagePath) {
          throw new functions.https.HttpsError(
            "failed-precondition",
            "קובץ האקסל לא נמצא. אנא נסה להעלות אותו מחדש."
          );
        }

        // Download and parse Excel file
        // CRITICAL: Explicitly use the correct bucket name to avoid bucket mismatch errors
        const bucket = admin.storage().bucket(YARD_STORAGE_BUCKET);
        console.log("[yardImportCommitJob] Using bucket for inline parse:", {
          bucketName: bucket.name,
          explicitBucketName: YARD_STORAGE_BUCKET,
          storagePath,
          bucketMatches: bucket.name === YARD_STORAGE_BUCKET,
        });
        const file = bucket.file(storagePath);
        
        let fileBuffer: Buffer;
        try {
          const [exists] = await file.exists();
          if (!exists) {
            console.error('[yardImportCommitJob] Excel file does not exist in Storage for inline parse', {
              storagePath,
              bucketName: bucket.name,
            });
            throw new Error(`קובץ האקסל לא נמצא ב-Storage (נתיב: ${storagePath}).`);
          }

          const [downloaded] = await file.download();
          fileBuffer = downloaded;

          console.log(
            '[yardImportCommitJob] Downloaded file for inline parse',
            { storagePath, bufferLength: fileBuffer.length }
          );
        } catch (downloadError: any) {
          console.error('[yardImportCommitJob] Failed to download file for inline parse:', {
            error: downloadError,
            storagePath,
          });

          const message =
            downloadError?.message ||
            'קובץ האקסל לא נמצא או לא ניתן לקריאה. אנא נסה להעלות אותו מחדש.';

          // Update job status to FAILED
          await jobRef.update({
            status: "FAILED",
            error: {
              message,
              code: downloadError?.code || "DOWNLOAD_FAILED",
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          throw new functions.https.HttpsError("internal", message);
        }

        // Parse Excel using shared helper
        const parseResult = await parseExcelFileBuffer(
          fileBuffer,
          yardUid,
          jobId,
          "[yardImportCommitJob]"
        );

        const { previewRows: parsedPreviewRows, summary: parsedSummary } = parseResult;

        // Write preview rows to Firestore
        const previewCollection = jobRef.collection("preview");
        const batch = db.batch();
        parsedPreviewRows.forEach((row) => {
          const rowId = String(row.rowIndex).padStart(4, "0");
          const rowRef = previewCollection.doc(rowId);
          batch.set(rowRef, row);
        });
        await batch.commit();

        console.log(`[yardImportCommitJob] Wrote ${parsedPreviewRows.length} preview rows from inline parse`);

        // Update job with parsed summary and set to PREVIEW_READY
        // This ensures the job is in the correct state before proceeding with commit
        await jobRef.update({
          status: "PREVIEW_READY",
          summary: {
            rowsTotal: parsedSummary.rowsTotal,
            rowsValid: parsedSummary.rowsValid,
            rowsWithWarnings: parsedSummary.rowsWithWarnings,
            rowsWithErrors: parsedSummary.rowsWithErrors,
            carsToCreate: parsedSummary.rowsValid,
            carsToUpdate: 0,
            carsSkipped: parsedSummary.rowsWithErrors,
            carsProcessed: 0,
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        console.log(`[yardImportCommitJob] Updated job to PREVIEW_READY after inline parse`, {
          jobId,
          rowsTotal: parsedSummary.rowsTotal,
          rowsValid: parsedSummary.rowsValid,
        });

        // Reload job data after parse
        const refreshedSnap = await jobRef.get();
        const refreshedData = refreshedSnap.data();
        if (!refreshedData) {
          throw new functions.https.HttpsError(
            "internal",
            "Failed to reload job data after inline parse"
          );
        }
        jobData = refreshedData;

        console.log(
          `[yardImportCommitJob] Inline parse completed: ${parsedSummary.rowsValid} valid rows, ${parsedSummary.rowsWithErrors} errors`
        );
      }

      // Check if job is ready to commit (should be PREVIEW_READY now)
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
        `[yardImportCommitJob] Committing job ${jobId}: ${validRows.length} valid rows out of ${previewRows.length} total`
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
        `[yardImportCommitJob] Successfully committed job ${jobId}: ${carsCreated} created, ${carsUpdated} updated`
      );

      return { ok: true };
    } catch (error: any) {
      console.error(`[yardImportCommitJob][ERROR] Error committing yard import job ${jobId}:`, {
        error,
        message: error?.message,
        stack: error?.stack,
        code: error?.code,
        yardUid,
        jobId,
      });

      // Try to update job with error status
      try {
        const jobRef = db
          .collection("users")
          .doc(yardUid)
          .collection("yardImportJobs")
          .doc(jobId);
        await jobRef.update({
          status: "FAILED",
          error: {
            message: error?.message || "Unknown error during commit",
            code: error?.code || "UNKNOWN_ERROR",
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (updateError) {
        console.error(`[yardImportCommitJob][ERROR] Failed to update job with error status:`, updateError);
      }

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

