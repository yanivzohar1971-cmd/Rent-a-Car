#!/usr/bin/env node
/**
 * Firebase User Data Completion Engine CLI
 *
 * SOURCE is always read-only. This CLI defaults to DRY RUN.
 * APPLY is refused until a separately approved task enables it.
 *
 * Usage:
 *   node tools/userDataCompletion/firebase-user-sync.mjs dry-run --profile client-debug-copy --mode missing-only
 *   node tools/userDataCompletion/firebase-user-sync.mjs inspect --profile client-debug-copy
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { initializeAdmin } from './lib/adminInit.mjs';
import { verifySourceAndTarget, IdentityMismatchError } from './lib/identity.mjs';
import { createReadOnlySourceAdapter, createTargetAdapter, assertNoWriteMethods } from './lib/adapters.mjs';
import { runDryRun } from './lib/engine.mjs';
import { MODES } from './lib/compare.mjs';
import profileDefault from './profiles/client-debug-copy.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    command: argv[2] || 'dry-run',
    profile: 'client-debug-copy',
    mode: MODES.MISSING_ONLY,
    sourceUid: null,
    targetUid: null,
    apply: false,
  };
  for (let i = 3; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--profile') args.profile = argv[++i];
    else if (token === '--mode') args.mode = argv[++i];
    else if (token === '--source-uid') args.sourceUid = argv[++i];
    else if (token === '--target-uid') args.targetUid = argv[++i];
    else if (token === '--apply') args.apply = true;
  }
  return args;
}

async function loadProfile(name) {
  if (name === 'client-debug-copy') return profileDefault;
  const mod = await import(resolve(__dirname, `profiles/${name}.mjs`));
  return mod.default || mod;
}

function printSummary(result) {
  const { plan, totals } = result;
  console.log('');
  console.log('=== Firebase User Data Completion Engine — DRY RUN ===');
  console.log(`runId: ${plan.runId}`);
  console.log(`mode: ${plan.mode}`);
  console.log(`sourceUid: ${plan.sourceUid}`);
  console.log(`targetUid: ${plan.targetUid}`);
  console.log(`SOURCE docs: ${plan.counts.sourceTotalDocuments}`);
  console.log(`TARGET docs: ${plan.counts.targetTotalDocuments}`);
  console.log(`IDENTICAL: ${totals.IDENTICAL}`);
  console.log(`MISSING_DOCUMENT: ${totals.MISSING_DOCUMENT}`);
  console.log(`MISSING_FIELD: ${totals.MISSING_FIELD}`);
  console.log(`SOURCE_CHANGED: ${totals.SOURCE_CHANGED}`);
  console.log(`CONFLICT: ${totals.CONFLICT}`);
  console.log(`TARGET_ONLY: ${totals.TARGET_ONLY}`);
  console.log(`UNKNOWN_SCOPE: ${totals.UNKNOWN_SCOPE}`);
  console.log(`Planned MISSING_ONLY writes: ${plan.counts.plannedMissingOnlyWrites}`);
  console.log(`Firestore writes this run: ${plan.firestoreWrites}`);
  console.log(`Auth writes this run: ${plan.authWrites}`);
  console.log(`Storage writes this run: ${plan.storageWrites}`);
  console.log(`Recommended APPLY semantics: ${plan.recommendedApplySemantics}`);
  if (plan.planPath) console.log(`Plan file: ${plan.planPath}`);
  console.log('STOPPED AFTER DRY RUN — no APPLY performed.');
  console.log('');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.apply || args.command === 'apply') {
    console.error('APPLY is disabled in this task. Re-run dry-run only; Yaniv must approve APPLY separately.');
    process.exit(2);
  }

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

  const sourceAdapter = createReadOnlySourceAdapter(db, { uid: profile.sourceUid });
  const targetAdapter = createTargetAdapter(db, { uid: profile.targetUid, writeEnabled: false });
  assertNoWriteMethods(sourceAdapter);
  assertNoWriteMethods(targetAdapter);

  const planDir = resolve(__dirname, 'runs');
  mkdirSync(planDir, { recursive: true });

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
    firestoreWrites: 0,
    authWrites: 0,
    storageWrites: 0,
    stoppedAt: 'DRY_RUN',
  }, null, 2)}\n`, 'utf8');

  printSummary(result);
  console.log(`Audit: ${auditPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
