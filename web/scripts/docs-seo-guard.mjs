#!/usr/bin/env node

/**
 * SEO Docs Guard
 * 
 * Validates markdown files in docs/seo/ for common formatting issues:
 * - Concatenated commands (e.g., "cd webnpm")
 * - Headings collapsed mid-line (### not at start)
 * - Canonical Commands block must be exactly 4 lines
 * 
 * Usage: npm run docs:seo:guard
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "../..");
const docsSeoDir = path.join(repoRoot, "docs", "seo");

const FILES_TO_CHECK = [
  "SEO_FIX_SUMMARY.md",
  "TECH_SEO_IMPLEMENTATION.md",
  "SEO_IMPLEMENTATION_SUMMARY.md",
];

const CANONICAL_COMMANDS = [
  "cd web",
  "npm run gen:sitemap:advanced",
  "npm run build",
  "npm run seo:smoke",
];

let errors = [];
let warnings = [];

/**
 * Check for concatenated commands
 */
function checkConcatenatedCommands(content, filename) {
  const badPatterns = [
    /cd webnpm/,
    /npm run gen:sitemap:advancednpm/,
    /buildnpm/,
    /gen:sitemap:advan[^c]/,
  ];

  badPatterns.forEach((pattern) => {
    if (pattern.test(content)) {
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          errors.push(
            `${filename}:${index + 1}: Found concatenated command: "${line.trim()}"`
          );
        }
      });
    }
  });
}

/**
 * Check for headings collapsed mid-line
 */
function checkHeadingsMidLine(content, filename) {
  const lines = content.split("\n");
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    // Check if line contains ### but doesn't start with it (after trimming)
    if (trimmed.includes("###") && !trimmed.startsWith("###")) {
      // Allow if it's in a code block or link
      if (!trimmed.includes("```") && !trimmed.match(/\[.*###.*\]/)) {
        errors.push(
          `${filename}:${index + 1}: Heading "###" found mid-line: "${trimmed.substring(0, 60)}..."`
        );
      }
    }
  });
}

/**
 * Check Canonical Commands block in SEO_FIX_SUMMARY.md
 */
function checkCanonicalCommandsBlock(content, filename) {
  if (filename !== "SEO_FIX_SUMMARY.md") {
    return; // Only check this file
  }

  const lines = content.split("\n");
  const headerIndex = lines.findIndex((line) =>
    line.includes("## Canonical Commands (Expected)")
  );

  if (headerIndex === -1) {
    errors.push(`${filename}: Missing "## Canonical Commands (Expected)" section`);
    return;
  }

  // Find the next 4 non-empty lines after the header
  const commands = [];
  let lineIndex = headerIndex + 1;
  let found = 0;

  while (lineIndex < lines.length && found < 4) {
    const line = lines[lineIndex].trim();
    if (line && !line.startsWith("Note:") && !line.startsWith("#")) {
      commands.push(line);
      found++;
    }
    lineIndex++;
  }

  if (commands.length !== 4) {
    errors.push(
      `${filename}: Canonical Commands block must have exactly 4 lines, found ${commands.length}`
    );
    return;
  }

  // Check each command matches exactly
  CANONICAL_COMMANDS.forEach((expected, index) => {
    if (commands[index] !== expected) {
      errors.push(
        `${filename}: Canonical Commands line ${index + 1} mismatch. Expected: "${expected}", Found: "${commands[index]}"`
      );
    }
  });
}

/**
 * Main validation function
 */
function validateFile(filepath, filename) {
  if (!fs.existsSync(filepath)) {
    warnings.push(`File not found: ${filepath} (skipping)`);
    return;
  }

  const content = fs.readFileSync(filepath, "utf8");

  checkConcatenatedCommands(content, filename);
  checkHeadingsMidLine(content, filename);
  checkCanonicalCommandsBlock(content, filename);
}

// Main execution
console.log("[docs-seo-guard] Validating SEO documentation files...\n");

FILES_TO_CHECK.forEach((filename) => {
  const filepath = path.join(docsSeoDir, filename);
  validateFile(filepath, filename);
});

// Report results
if (warnings.length > 0) {
  console.warn("[docs-seo-guard] Warnings:");
  warnings.forEach((w) => console.warn(`  ⚠️  ${w}`));
  console.log();
}

if (errors.length > 0) {
  console.error("[docs-seo-guard] ❌ FAILED: Found", errors.length, "error(s):\n");
  errors.forEach((err) => console.error(`  ❌ ${err}`));
  console.error("\n[docs-seo-guard] Please fix the errors above.");
  process.exit(1);
} else {
  console.log("[docs-seo-guard] ✅ All checks passed!");
  process.exit(0);
}

