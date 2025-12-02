import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as XLSX from "xlsx";

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
 */
export const yardImportParseExcel = functions.storage
  .object()
  .onFinalize(async (object) => {
    const filePath = object.name;
    if (!filePath) {
      console.log("No file path, skipping");
      return;
    }

    // Only process yard import files
    if (!filePath.startsWith("yardImports/")) {
      return;
    }

    // Extract yardUid and jobId from path: yardImports/{yardUid}/{jobId}.xlsx
    const pathParts = filePath.split("/");
    if (pathParts.length !== 3 || !pathParts[2].endsWith(".xlsx")) {
      console.log(`Invalid yard import path format: ${filePath}`);
      return;
    }

    const yardUid = pathParts[1];
    const jobId = pathParts[2].replace(".xlsx", "");

    console.log(
      `yardImportParseExcel: starting for job ${jobId}, path=${filePath}, yardUid=${yardUid}`
    );

    const jobRef = db
      .collection("users")
      .doc(yardUid)
      .collection("yardImportJobs")
      .doc(jobId);

    try {
      // Load job document
      const jobDoc = await jobRef.get();
      if (!jobDoc.exists) {
        console.error(`yardImportParseExcel: Job ${jobId} not found for user ${yardUid}`);
        return;
      }

      const jobData = jobDoc.data();
      if (!jobData) {
        console.error(`yardImportParseExcel: Job ${jobId} has no data`);
        return;
      }

      // Check if job is in correct status
      if (jobData.status !== "UPLOADED") {
        console.log(
          `yardImportParseExcel: Job ${jobId} is not in UPLOADED status (current: ${jobData.status}), skipping`
        );
        return;
      }

      // Update status to processing
      console.log(`yardImportParseExcel: updating job ${jobId} to PROCESSING`);
      await jobRef.update({
        status: "PROCESSING",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Download file from Storage
      const bucket = admin.storage().bucket(object.bucket);
      const file = bucket.file(filePath);
      const [fileBuffer] = await file.download();

      // Parse Excel file
      const workbook = XLSX.read(fileBuffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0]; // Use first sheet
      const worksheet = workbook.Sheets[sheetName];

      // Convert to JSON (first row is headers)
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, {
        raw: false, // Convert everything to strings for easier processing
      });

      if (jsonData.length === 0) {
        throw new Error("Excel file is empty or has no data rows");
      }

      // Get headers (first row keys)
      const headers = Object.keys(jsonData[0] || {});
      console.log(`yardImportParseExcel: parsed ${jsonData.length} rows for job ${jobId}, headers:`, headers);

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
      const mileageColumn = findColumn(["ק\"מ", "km", "mileage", "odometer"]);
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
      console.log(`yardImportParseExcel: updating job ${jobId} to PREVIEW_READY with ${rowsValid} valid rows, ${rowsWithErrors} errors`);
      await jobRef.update({
        status: "PREVIEW_READY",
        summary: {
          rowsTotal: rowsValid + rowsWithWarnings + rowsWithErrors,
          rowsValid: rowsValid,
          rowsWithWarnings: rowsWithWarnings,
          rowsWithErrors: rowsWithErrors,
          carsToCreate: rowsValid, // Will be refined during commit
          carsToUpdate: 0,
          carsSkipped: rowsWithErrors,
          carsProcessed: 0,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      console.log(
        `Successfully processed yard import job ${jobId}: ${rowsValid} valid rows, ${rowsWithErrors} errors`
      );
    } catch (error: any) {
      console.error(`Error processing yard import job ${jobId}:`, error);

      // Update job with error status
      try {
        await jobRef.update({
          status: "FAILED",
          error: {
            message: error.message || "Unknown error during Excel parsing",
          },
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (updateError) {
        console.error("Failed to update job with error status:", updateError);
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
      const baseTimestamp = now.toMillis();

      // Reference to yard's car collection
      // Using users/{uid}/carSales as the Firestore collection for yard cars
      // IMPORTANT: Collection path must match CloudToLocalRestoreRepository.restoreCarSales()
      // which reads from users/{uid}/carSales
      const carSalesCollection = db
        .collection("users")
        .doc(yardUid)
        .collection("carSales");

      // Row counter for generating unique numeric IDs
      let rowCounter = 0;

      for (const row of validRows) {
        const normalized = row.normalized || {};
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

          const importSource = {
            yardUid: yardUid,
            importJobId: jobId,
            rowIndex: row.rowIndex,
            importerId: jobData.source?.importerId || "unknown",
            importedAt: now,
          };

          // Check if we're creating new or updating existing
          const isNewCar = existingCarQuery.empty;
          
          // Generate or retrieve car ID
          // CRITICAL: Explicit numeric ID field required for CloudToLocalRestoreRepository.restoreCarSales()
          // which expects data["id"] as Number. Without this field, documents are skipped during sync.
          let carId: number;
          if (isNewCar) {
            // Generate unique numeric ID for new car
            // Format: timestamp (millis) + row counter (ensures uniqueness within job)
            // This ID will be used as the Room database primary key when synced
            rowCounter++;
            carId = baseTimestamp + rowCounter;
          } else {
            // Use existing car's ID (preserve it)
            const existingData = existingCarQuery.docs[0].data();
            carId = (existingData.id as number) || baseTimestamp + rowCounter;
            // If existing car somehow lacks ID, generate one but log warning
            if (!existingData.id) {
              rowCounter++;
              carId = baseTimestamp + rowCounter;
              console.warn(`Existing car ${existingCarQuery.docs[0].id} lacks numeric ID, generating new: ${carId}`);
            }
          }

          // Build car document data (matching CarSale entity structure)
          // CarSale has required fields: firstName, lastName, phone, carTypeName, saleDate, salePrice, commissionPrice
          const carTypeName = normalized.manufacturer && normalized.model
            ? `${normalized.manufacturer} ${normalized.model}`
            : normalized.manufacturer || normalized.model || "רכב";
          
          // Map gear to GearboxType enum values (AT, MT, CVT, DCT, AMT, OTHER)
          let gearboxType: string | null = null;
          if (normalized.gear) {
            const gearLower = String(normalized.gear).toLowerCase();
            if (gearLower.includes("automatic") || gearLower.includes("auto") || gearLower.includes("אוטו")) {
              gearboxType = "AT";
            } else if (gearLower.includes("manual") || gearLower.includes("ידני")) {
              gearboxType = "MT";
            } else if (gearLower.includes("cvt")) {
              gearboxType = "CVT";
            } else if (gearLower.includes("dct")) {
              gearboxType = "DCT";
            } else if (gearLower.includes("amt")) {
              gearboxType = "AMT";
            } else {
              gearboxType = "OTHER";
            }
          }

          // Map ownership to ownershipDetails (not fuelType)
          // FuelType enum: PETROL, DIESEL, HYBRID, EV, OTHER
          // Ownership should go to ownershipDetails field
          const ownershipDetails = normalized.ownership || null;
          
          // Build CarSale document matching Android entity structure
          // Note: Firestore field names use camelCase matching Kotlin property names
          // Room column names use snake_case (via @ColumnInfo), but Firestore sync maps them
          // IMPORTANT: Must include explicit numeric 'id' field for CloudToLocalRestoreRepository to sync
          const carData: any = {
            // CRITICAL: Explicit numeric ID field required for restore/sync to Room database
            // CloudToLocalRestoreRepository.restoreCarSales() expects data["id"] as Number
            // Without this field, documents are skipped during sync and won't appear in Yard Fleet
            id: carId,
            
            // Required fields for CarSale entity (cannot be null)
            firstName: "", // Not applicable for yard-owned cars, but required by entity
            lastName: "", // Not applicable for yard-owned cars, but required by entity
            phone: "", // Not applicable for yard-owned cars, but required by entity
            carTypeName: carTypeName,
            saleDate: now.toMillis(), // Use import timestamp as sale date
            salePrice: normalized.askPrice || normalized.listPrice || 0,
            commissionPrice: 0, // Not applicable for yard fleet
            notes: normalized.license || normalized.licenseClean 
              ? `יובא מ-${normalized.license || licenseClean}` 
              : "יובא מקובץ אקסל",
            createdAt: now.toMillis(),
            updatedAt: now.toMillis(),
            userUid: yardUid, // Links to user/yard owner
            
            // Yard fleet specific fields (V2 extension, all nullable)
            brand: normalized.manufacturer || null,
            model: normalized.model || null,
            year: normalized.year || null,
            mileageKm: normalized.mileage || null,
            publicationStatus: "DRAFT", // New imports start as draft (matches CarPublicationStatus.DRAFT.value)
            
            // Context fields (required for proper categorization)
            roleContext: "YARD", // RoleContext.YARD - indicates this is managed by yard
            saleOwnerType: "YARD_OWNED", // SaleOwnerType.YARD_OWNED - yard owns this car
            
            // Technical specifications
            gearboxType: gearboxType, // GearboxType enum: AT, MT, CVT, DCT, AMT, OTHER
            fuelType: null, // FuelType not available in Excel import, leave null
            handCount: normalized.hand || null, // מספר יד
            color: normalized.color || null,
            engineDisplacementCc: normalized.engineCc || null,
            ownershipDetails: ownershipDetails, // מקוריות (פרטי/ליסינג)
            licensePlatePartial: licenseClean, // Cleaned license plate for deduplication
            
            // Import metadata (for Smart Publish tracking)
            importJobId: jobId, // ID of the import job this car came from
            importedAt: now.toMillis(), // Timestamp when this car was imported
            isNewFromImport: isNewCar, // true for new cars, false for updated ones
            
            // Import metadata (optional, for audit trail - nested object)
            importSource: importSource, // Nested object with import details
          };

          if (existingCarQuery.empty) {
            // Create new car
            const carRef = carSalesCollection.doc();
            await carRef.set(carData);
            carsCreated++;
          } else {
            // Update existing car (carId already set above to preserve existing ID)
            const existingCarDoc = existingCarQuery.docs[0];
            const existingData = existingCarDoc.data();
            // Preserve createdAt and publicationStatus from existing document
            // For legacy cars without publicationStatus, default to PUBLISHED
            const existingPublicationStatus = existingData.publicationStatus || "PUBLISHED";
            await existingCarDoc.ref.update({
              ...carData,
              id: carId, // Already set to existing ID above
              createdAt: existingData.createdAt || now.toMillis(), // Preserve existing createdAt
              publicationStatus: existingPublicationStatus, // Preserve existing status, default to PUBLISHED for legacy
              isNewFromImport: false, // Updated cars are not new from import
            });
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

