#!/usr/bin/env node
/**
 * Firebase User Data Completion Engine CLI
 *
 * SOURCE is always read-only.
 *
 * Usage:
 *   node tools/userDataCompletion/firebase-user-sync.mjs inspect --profile client-debug-copy
 *   node tools/userDataCompletion/firebase-user-sync.mjs dry-run --profile client-debug-copy --mode missing-only
 *   node tools/userDataCompletion/firebase-user-sync.mjs apply --profile client-debug-copy --mode missing-only --run-id <runId>
 *   node tools/userDataCompletion/firebase-user-sync.mjs analyze-differences --profile client-debug-copy
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { initializeAdmin } from './lib/adminInit.mjs';
import { verifySourceAndTarget, IdentityMismatchError } from './lib/identity.mjs';
import { createReadOnlySourceAdapter, createTargetAdapter, assertNoWriteMethods } from './lib/adapters.mjs';
import { runDryRun, scanUserTree } from './lib/engine.mjs';
import { runApplyMissingOnly, loadAndValidatePlan } from './lib/apply.mjs';
import { runAnalyzeDifferences } from './lib/analyzeDifferences.mjs';
import { MODES, collectionsForMode } from './lib/compare.mjs';
import profileDefault from './profiles/client-debug-copy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    command: argv[2] || 'dry-run',
    profile: 'client-debug-copy',
    mode: MODES.MISSING_ONLY,
    sourceUid: null,
    targetUid: null,
    runId: null,
  };
  for (let i = 3; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--profile') args.profile = argv[++i];
    else if (token === '--mode') args.mode = argv[++i];
    else if (token === '--source-uid') args.sourceUid = argv[++i];
    else if (token === '--target-uid') args.targetUid = argv[++i];
    else if (token === '--run-id') args.runId = argv[++i];
  }
  return args;
}

async function loadProfile(name) {
  if (name === 'client-debug-copy') return profileDefault;
  const mod = await import(resolve(__dirname, `profiles/${name}.mjs`));
  return mod.default || mod;
}

function printAnalysisSummary(report) {
  const sc = report.sourceChanged;
  const to = report.targetOnly;
  const cls = sc.byClassification;
  console.log('');
  console.log('=== READ-ONLY DIFFERENCE / SHAGRIR READINESS ANALYSIS ===');
  console.log(`SOURCE_CHANGED total: ${sc.total}`);
  console.log(`  by collection: ${JSON.stringify(sc.byCollection)}`);
  console.log(`  SHAGRIR_CRITICAL: ${cls.SHAGRIR_CRITICAL}`);
  console.log(`  BUSINESS_RELEVANT_NOT_SHAGRIR: ${cls.BUSINESS_RELEVANT_NOT_SHAGRIR}`);
  console.log(`  TARGET_LOCAL: ${cls.TARGET_LOCAL}`);
  console.log(`  IRRELEVANT: ${cls.IRRELEVANT}`);
  console.log(`  UNKNOWN: ${cls.UNKNOWN}`);
  console.log(`TARGET_ONLY total: ${to.total}`);
  console.log(`  by collection: ${JSON.stringify(to.byCollection)}`);
  console.log(`  reservations: ${to.reservationCount}`);
  console.log(`  Shagrir reservations: ${to.shagrirReservationCount}`);
  console.log(`  can contaminate matching: ${to.canContaminateMatching}`);
  console.log(`Shagrir supplier IDs: ${(report.shagrirSupplier.suppliers || []).map((s) => s.documentId).join(',') || '(none)'}`);
  console.log(`SOURCE Shagrir reservations: ${report.shagrirSupplier.source.reservationsTotal}`);
  console.log(`TARGET Shagrir reservations: ${report.shagrirSupplier.target.reservationsTotal}`);
  console.log(`READINESS: ${report.readiness}`);
  console.log(`Writes: firestore=${report.firestoreWrites} auth=${report.authWrites} storage=${report.storageWrites} deletes=${report.deletes}`);
  console.log('');
}

function printSummary(result, label = 'DRY RUN') {
  const { plan, totals } = result;
  const c = plan.counts;
  console.log('');
  console.log(`=== Firebase User Data Completion Engine — ${label} ===`);
  console.log(`runId: ${plan.runId}`);
  console.log(`mode: ${plan.mode}`);
  console.log(`sourceUid: ${plan.sourceUid}`);
  console.log(`targetUid: ${plan.targetUid}`);
  console.log(`SOURCE docs: ${c.sourceTotalDocuments}`);
  console.log(`TARGET docs: ${c.targetTotalDocuments}`);
  console.log(`IDENTICAL: ${totals.IDENTICAL}`);
  console.log(`MISSING_DOCUMENT: ${totals.MISSING_DOCUMENT}`);
  console.log(`MISSING_FIELD: ${totals.MISSING_FIELD}`);
  console.log(`SOURCE_CHANGED: ${totals.SOURCE_CHANGED}`);
  console.log(`TARGET_ONLY: ${totals.TARGET_ONLY}`);
  console.log(`CONFLICT: ${totals.CONFLICT}`);
  console.log(`UNKNOWN_SCOPE: ${totals.UNKNOWN_SCOPE}`);
  console.log(`EXCLUDED_SHARED_GLOBAL: ${totals.EXCLUDED_SHARED_GLOBAL}`);
  console.log(`Nested docs (source+target): ${c.nestedDocumentsTotal}`);
  console.log(`Planned document creates: ${c.plannedDocumentCreates}`);
  console.log(`Planned field additions: ${c.plannedFieldAdditions}`);
  console.log(`TOTAL PLANNED FUTURE WRITES: ${c.totalPlannedFutureWrites}`);
  console.log(`Firestore writes this run: ${plan.firestoreWrites}`);
  console.log(`Auth writes this run: ${plan.authWrites}`);
  console.log(`Storage writes this run: ${plan.storageWrites}`);
  console.log(`Shagrir SOURCE reservations: ${plan.shagrir.source.reservationsTotal}`);
  console.log(`  with supplierOrderNumber: ${plan.shagrir.source.withSupplierOrder}`);
  console.log(`  with externalContractNumber: ${plan.shagrir.source.withExternalContract}`);
  console.log(`  with both: ${plan.shagrir.source.withBoth}`);
  console.log(`  with neither: ${plan.shagrir.source.withNeither}`);
  console.log(`Shagrir TARGET reservations: ${plan.shagrir.target.reservationsTotal}`);
  console.log(`  with supplierOrderNumber: ${plan.shagrir.target.withSupplierOrder}`);
  console.log(`  with externalContractNumber: ${plan.shagrir.target.withExternalContract}`);
  console.log(`  with both: ${plan.shagrir.target.withBoth}`);
  console.log(`  with neither: ${plan.shagrir.target.withNeither}`);
  if (plan.planPath) console.log(`Plan file: ${plan.planPath}`);
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv);
  const profile = await loadProfile(args.profile);
  if (args.sourceUid) profile.sourceUid = args.sourceUid;
  if (args.targetUid) profile.targetUid = args.targetUid;

  const { auth, db } = initializeAdmin({ projectId: profile.projectId, preferAdc: true });

  let identity;
  try {
    identity = await verifySourceAndTarget(auth, profile);
  } catch (error) {
    if (error instanceof IdentityMismatchError) {
      console.error(`IDENTITY STOP: ${error.message}`);
      console.error(JSON.stringify(error.details || {}, null, 2));
      process.exit(1);
    }
    throw error;
  }

  const planDir = resolve(__dirname, 'runs');
  const backupDir = resolve(__dirname, 'backups');
  mkdirSync(planDir, { recursive: true });
  mkdirSync(backupDir, { recursive: true });

  if (args.command === 'analyze-differences' || args.command === 'analyze-shagrir-readiness') {
    const sourceAdapter = createReadOnlySourceAdapter(db, { uid: profile.sourceUid });
    const targetAdapter = createTargetAdapter(db, { uid: profile.targetUid, writeEnabled: false });
    assertNoWriteMethods(sourceAdapter);
    assertNoWriteMethods(targetAdapter);

    console.log('=== IDENTITY ===');
    console.log(`SOURCE: PASS ${identity.source.uid} / ${identity.source.email}`);
    console.log(`TARGET: PASS ${identity.target.uid} / ${identity.target.email}`);

    const report = await runAnalyzeDifferences({
      sourceAdapter,
      targetAdapter,
      sourceUid: profile.sourceUid,
      targetUid: profile.targetUid,
      identity: {
        source: { uid: identity.source.uid, email: identity.source.email },
        target: { uid: identity.target.uid, email: identity.target.email },
      },
      scanUserTree,
      artifactDir: planDir,
    });

    printAnalysisSummary(report);
    if (report.artifactPath) console.log(`Artifact: ${report.artifactPath}`);
    return;
  }

  if (args.command === 'inspect') {
    const sourceAdapter = createReadOnlySourceAdapter(db, { uid: profile.sourceUid });
    const targetAdapter = createTargetAdapter(db, { uid: profile.targetUid, writeEnabled: false });
    assertNoWriteMethods(sourceAdapter);
    assertNoWriteMethods(targetAdapter);
    const sourceScan = await scanUserTree(sourceAdapter, { collections: collectionsForMode() });
    const targetScan = await scanUserTree(targetAdapter, { collections: collectionsForMode() });
    const summary = {
      identity,
      source: {
        uid: sourceScan.uid,
        totalDocuments: sourceScan.totalDocuments,
        discoveredCollections: sourceScan.discoveredCollections,
        unknownCollections: sourceScan.unknownCollections,
        byCollection: Object.fromEntries(
          Object.entries(sourceScan.byCollection)
            .filter(([, v]) => !v.nested)
            .map(([k, v]) => [k, { scope: v.scope, count: v.count }]),
        ),
        shagrir: sourceScan.shagrirCoverage,
      },
      target: {
        uid: targetScan.uid,
        totalDocuments: targetScan.totalDocuments,
        discoveredCollections: targetScan.discoveredCollections,
        unknownCollections: targetScan.unknownCollections,
        byCollection: Object.fromEntries(
          Object.entries(targetScan.byCollection)
            .filter(([, v]) => !v.nested)
            .map(([k, v]) => [k, { scope: v.scope, count: v.count }]),
        ),
        shagrir: targetScan.shagrirCoverage,
      },
      firestoreWrites: 0,
      authWrites: 0,
      storageWrites: 0,
    };
    const path = resolve(planDir, `schema-summary-${Date.now()}.json`);
    writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify(summary, null, 2));
    console.log(`Schema summary: ${path}`);
    return;
  }

  if (args.command === 'apply') {
    if (!args.runId) {
      console.error('APPLY refused: --run-id <exactRunId> is required');
      process.exit(2);
    }
    if (String(args.mode).toLowerCase() !== MODES.MISSING_ONLY) {
      console.error('APPLY refused: only --mode missing-only is enabled for this workflow');
      process.exit(2);
    }

    const planPath = resolve(planDir, `firebase-sync-plan-${args.runId}.json`);
    if (!existsSync(planPath)) {
      console.error(`APPLY refused: plan not found at ${planPath}`);
      process.exit(2);
    }

    console.log('=== PRE-APPLY: identity PASS ===');
    console.log(`SOURCE: ${identity.source.uid} / ${identity.source.email}`);
    console.log(`TARGET: ${identity.target.uid} / ${identity.target.email}`);

    const validated = loadAndValidatePlan(planPath, {
      expectedRunId: args.runId,
      expectedSourceUid: profile.sourceUid,
      expectedTargetUid: profile.targetUid,
      expectedMode: MODES.MISSING_ONLY,
    });
    console.log('=== PRE-APPLY: plan validation PASS ===');
    console.log(`runId: ${validated.plan.runId}`);
    console.log(`mode: ${validated.plan.mode}`);
    console.log(`CREATE_DOCUMENT ops: ${validated.createCount}`);
    console.log(`ADD_MISSING_FIELDS ops: ${validated.fieldAddCount}`);

    const sourceAdapter = createReadOnlySourceAdapter(db, { uid: profile.sourceUid });
    assertNoWriteMethods(sourceAdapter);

    // Pre-backup target scan with writeEnabled=false (read inventory only).
    const targetReadAdapter = createTargetAdapter(db, { uid: profile.targetUid, writeEnabled: false });
    const targetScan = await scanUserTree(targetReadAdapter, { collections: collectionsForMode() });

    const targetWriteAdapter = createTargetAdapter(db, { uid: profile.targetUid, writeEnabled: true });

    console.log('=== APPLY: backup + MISSING_ONLY creates ===');
    const applyResult = await runApplyMissingOnly({
      planPath,
      runId: args.runId,
      sourceUid: profile.sourceUid,
      targetUid: profile.targetUid,
      mode: MODES.MISSING_ONLY,
      sourceAdapter,
      targetAdapter: targetWriteAdapter,
      targetScan,
      backupDir,
      checkpointDir: planDir,
      auditDir: planDir,
      expectedCreateCount: 1405,
    });

    console.log('=== APPLY RESULT ===');
    console.log(`backup: ${applyResult.backup.dir}`);
    console.log(`backup docs: ${applyResult.backup.manifest.totalDocuments}`);
    console.log(`planned creates: ${applyResult.results.plannedCreates}`);
    console.log(`successful creates: ${applyResult.results.successfulCreates}`);
    console.log(`skipped (target exists): ${applyResult.results.skippedTargetExists}`);
    console.log(`skipped (source missing): ${applyResult.results.skippedSourceMissing}`);
    console.log(`skipped (hash mismatch): ${applyResult.results.skippedHashMismatch}`);
    console.log(`failures: ${applyResult.results.failures}`);
    console.log(`TARGET Firestore writes: ${applyResult.results.firestoreWrites}`);
    console.log(`SOURCE Firestore writes: 0`);
    console.log(`Auth writes: 0`);
    console.log(`Storage writes: 0`);
    console.log(`Deletes: 0`);
    console.log(`Apply audit: ${applyResult.auditPath}`);
    console.log(`Checkpoint: ${applyResult.checkpointPath}`);

    // Post-apply verification dry-run (read-only).
    console.log('=== POST-APPLY VERIFICATION DRY RUN ===');
    const postSource = createReadOnlySourceAdapter(db, { uid: profile.sourceUid });
    const postTarget = createTargetAdapter(db, { uid: profile.targetUid, writeEnabled: false });
    assertNoWriteMethods(postSource);
    assertNoWriteMethods(postTarget);
    const verifyResult = await runDryRun({
      sourceAdapter: postSource,
      targetAdapter: postTarget,
      sourceUid: profile.sourceUid,
      targetUid: profile.targetUid,
      mode: MODES.MISSING_ONLY,
      identity,
      planDir,
    });
    const verifyAuditPath = resolve(planDir, `audit-post-apply-${args.runId}.json`);
    writeFileSync(verifyAuditPath, `${JSON.stringify({
      afterRunId: args.runId,
      verificationRunId: verifyResult.runId,
      mode: MODES.MISSING_ONLY,
      sourceUid: profile.sourceUid,
      targetUid: profile.targetUid,
      identity: {
        source: { uid: identity.source.uid, email: identity.source.email },
        target: { uid: identity.target.uid, email: identity.target.email },
      },
      apply: applyResult.audit,
      counts: verifyResult.plan.counts,
      diffs: verifyResult.totals,
      shagrir: verifyResult.plan.shagrir,
      firestoreWrites: 0,
      authWrites: 0,
      storageWrites: 0,
      stoppedAt: 'POST_APPLY_VERIFY_DRY_RUN',
    }, null, 2)}\n`, 'utf8');

    printSummary(verifyResult, 'POST-APPLY DRY RUN');
    console.log(`Post-apply audit: ${verifyAuditPath}`);
    return;
  }

  // Default: dry-run
  const sourceAdapter = createReadOnlySourceAdapter(db, { uid: profile.sourceUid });
  const targetAdapter = createTargetAdapter(db, { uid: profile.targetUid, writeEnabled: false });
  assertNoWriteMethods(sourceAdapter);
  assertNoWriteMethods(targetAdapter);

  const result = await runDryRun({
    sourceAdapter,
    targetAdapter,
    sourceUid: profile.sourceUid,
    targetUid: profile.targetUid,
    mode: args.mode,
    identity,
    planDir,
  });

  const auditPath = resolve(planDir, `audit-${result.runId}.json`);
  writeFileSync(auditPath, `${JSON.stringify({
    runId: result.runId,
    mode: args.mode,
    sourceUid: profile.sourceUid,
    targetUid: profile.targetUid,
    identity: {
      source: { uid: identity.source.uid, email: identity.source.email, claims: identity.source.customClaims },
      target: { uid: identity.target.uid, email: identity.target.email, claims: identity.target.customClaims },
    },
    counts: result.plan.counts,
    diffs: result.totals,
    shagrir: result.plan.shagrir,
    firestoreWrites: 0,
    authWrites: 0,
    storageWrites: 0,
    stoppedAt: 'DRY_RUN',
    applyPerformed: false,
    deletePerformed: false,
  }, null, 2)}\n`, 'utf8');

  printSummary(result);
  console.log('STOPPED AFTER DRY RUN — no APPLY performed.');
  console.log(`Audit: ${auditPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
