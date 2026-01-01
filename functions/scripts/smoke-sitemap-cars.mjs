#!/usr/bin/env node

/**
 * Smoke test for serveCarsSitemap function
 * 
 * Self-contained: starts Firebase emulators, runs tests, then stops them.
 * Lightweight check - no test frameworks required.
 * 
 * Usage: npm run smoke:sitemap-cars
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const functionsDir = resolve(__dirname, "..");
const repoRoot = resolve(functionsDir, "..");

// Default emulator configuration
const EMULATOR_HOST = process.env.FIREBASE_EMULATOR_HOST || "127.0.0.1:5001";
const PROJECT_ID = process.env.GCLOUD_PROJECT || "carexpert-94faa";
const REGION = process.env.FUNCTIONS_REGION || "us-central1";
const FUNCTION_NAME = "serveCarsSitemap";
const EMULATOR_READY_TIMEOUT = 60000; // 60 seconds max wait

// Firebase Functions emulator URL pattern
const BASE_URL = `http://${EMULATOR_HOST}/${PROJECT_ID}/${REGION}/${FUNCTION_NAME}`;

let errors = [];
let warnings = [];
let emulatorProcess = null;

/**
 * Wait for emulator to be ready
 */
async function waitForEmulator(maxWaitMs = EMULATOR_READY_TIMEOUT) {
  const startTime = Date.now();
  const healthUrl = `http://${EMULATOR_HOST}`;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: AbortSignal.timeout(2000), // 2 second timeout per attempt
      });
      // Any response (even 404) means emulator is running
      if (response.status === 200 || response.status === 404) {
        console.log(`[smoke-sitemap-cars] ✅ Emulator ready at ${EMULATOR_HOST}`);
        return true;
      }
    } catch (error) {
      // Emulator not ready yet, continue waiting
      if (error.name !== "AbortError") {
        // Non-timeout error - log but continue
        console.log(`[smoke-sitemap-cars] Waiting for emulator... (${error.message})`);
      }
    }

    // Wait 500ms before next attempt
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return false;
}

/**
 * Start Firebase emulators
 */
async function startEmulator() {
  console.log("[smoke-sitemap-cars] Starting Firebase emulators...");

  return new Promise((resolve, reject) => {
    // Spawn emulator process
    emulatorProcess = spawn("firebase", ["emulators:start", "--only", "functions"], {
      cwd: repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });

    let stdout = "";
    let stderr = "";

    emulatorProcess.stdout.on("data", (data) => {
      const text = data.toString();
      stdout += text;
      // Log emulator output (can be verbose)
      if (process.argv.includes("--verbose")) {
        process.stdout.write(text);
      }
    });

    emulatorProcess.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      // Log errors
      if (process.argv.includes("--verbose")) {
        process.stderr.write(text);
      }
    });

    emulatorProcess.on("error", (error) => {
      reject(new Error(`Failed to start emulator: ${error.message}`));
    });

    // Check for "All emulators ready" message
    const checkReady = setInterval(() => {
      if (stdout.includes("All emulators ready") || stdout.includes("emulators running")) {
        clearInterval(checkReady);
        resolve();
      }
    }, 500);

    // Timeout after 60 seconds
    setTimeout(() => {
      clearInterval(checkReady);
      if (!stdout.includes("All emulators ready") && !stdout.includes("emulators running")) {
        reject(new Error("Emulator did not start within timeout"));
      }
    }, EMULATOR_READY_TIMEOUT);
  });
}

/**
 * Stop emulator process
 */
function stopEmulator() {
  if (emulatorProcess) {
    console.log("[smoke-sitemap-cars] Stopping emulator...");
    emulatorProcess.kill("SIGINT");
    emulatorProcess = null;
  }
}

/**
 * Test a single endpoint
 */
async function testEndpoint(path, expectedStatus = 200) {
  const url = `${BASE_URL}${path}`;
  console.log(`[smoke-sitemap-cars] Testing: ${path}`);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/xml",
      },
    });

    const status = response.status;
    const contentType = response.headers.get("content-type") || "";
    const body = await response.text();

    // Check status
    if (status !== expectedStatus) {
      errors.push(`${path}: Expected status ${expectedStatus}, got ${status}`);
      return false;
    }

    // Check Content-Type
    if (!contentType.includes("application/xml") && !contentType.includes("text/xml")) {
      errors.push(`${path}: Content-Type should include "application/xml", got "${contentType}"`);
      return false;
    }

    // Check XML structure
    if (status === 200) {
      if (!body.includes("<?xml")) {
        errors.push(`${path}: Response body missing XML declaration`);
        return false;
      }

      // Check for valid sitemap root (urlset or error)
      if (!body.includes("<urlset") && !body.includes("<error>")) {
        errors.push(`${path}: Response body missing valid XML root (<urlset> or <error>)`);
        return false;
      }

      console.log(`[smoke-sitemap-cars] ✅ ${path}: Status ${status}, valid XML`);
    } else if (status === 404) {
      // 404 should still return XML
      if (!body.includes("<?xml")) {
        warnings.push(`${path}: 404 response should be XML, but missing XML declaration`);
      } else {
        console.log(`[smoke-sitemap-cars] ✅ ${path}: Status 404, valid XML error response`);
      }
    }

    return true;
  } catch (error) {
    errors.push(`${path}: Request failed - ${error.message}`);
    return false;
  }
}

/**
 * Main test execution
 */
async function runSmokeTest() {
  console.log("[smoke-sitemap-cars] Starting smoke test...");
  console.log(`[smoke-sitemap-cars] Project: ${PROJECT_ID}`);
  console.log(`[smoke-sitemap-cars] Region: ${REGION}`);
  console.log(`[smoke-sitemap-cars] Function: ${FUNCTION_NAME}`);
  console.log("");

  try {
    // Start emulator
    await startEmulator();

    // Wait for emulator to be ready
    const ready = await waitForEmulator();
    if (!ready) {
      throw new Error("Emulator did not become ready within timeout");
    }

    console.log("");

    // Run tests
    await testEndpoint("/sitemap-cars.xml", 200);
    await testEndpoint("/sitemap-cars-1.xml", 200);
    await testEndpoint("/sitemap-invalid.xml", 404);
    await testEndpoint("/../sitemap-cars.xml", 404);

    console.log("");

    // Summary
    if (errors.length > 0) {
      console.error("[smoke-sitemap-cars] ❌ FAILED: Found", errors.length, "error(s):");
      errors.forEach((err) => console.error(`  ❌ ${err}`));
      if (warnings.length > 0) {
        console.warn("[smoke-sitemap-cars] Warnings:");
        warnings.forEach((w) => console.warn(`  ⚠️  ${w}`));
      }
      return 1;
    } else {
      console.log("[smoke-sitemap-cars] ✅ All checks passed!");
      if (warnings.length > 0) {
        console.warn("[smoke-sitemap-cars] Warnings:");
        warnings.forEach((w) => console.warn(`  ⚠️  ${w}`));
      }
      return 0;
    }
  } catch (error) {
    console.error("[smoke-sitemap-cars] ❌ Fatal error:", error.message);
    return 1;
  } finally {
    // Always stop emulator
    stopEmulator();
    // Give it a moment to clean up
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

// Handle process termination
process.on("SIGINT", () => {
  console.log("\n[smoke-sitemap-cars] Interrupted, cleaning up...");
  stopEmulator();
  process.exit(1);
});

process.on("SIGTERM", () => {
  console.log("\n[smoke-sitemap-cars] Terminated, cleaning up...");
  stopEmulator();
  process.exit(1);
});

// Run tests
runSmokeTest()
  .then((exitCode) => {
    process.exit(exitCode);
  })
  .catch((error) => {
    console.error("[smoke-sitemap-cars] ❌ Unhandled error:", error);
    stopEmulator();
    process.exit(1);
  });
