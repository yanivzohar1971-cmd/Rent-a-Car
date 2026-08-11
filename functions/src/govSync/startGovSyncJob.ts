/**
 * Callable: startGovSyncJob
 * Creates a govSyncJobs doc and returns jobId immediately. A Firestore trigger runs the actual sync.
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { runGovSyncJob } from "./runGovSyncJobTrigger";

const db = admin.firestore();

export type GovSyncMode = "ALL" | "PUBLISHED" | "STATUS";

export const startGovSyncJob = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "User must be authenticated");
  }

  const yardUid = context.auth.uid;
  const { mode, status: statusFilter } = data as { mode?: GovSyncMode; status?: string };

  if (!mode || !["ALL", "PUBLISHED", "STATUS"].includes(mode)) {
    throw new functions.https.HttpsError("invalid-argument", "mode must be ALL, PUBLISHED, or STATUS");
  }

  const jobRef = db.collection("govSyncJobs").doc();
  const jobId = jobRef.id;

  await jobRef.set({
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    createdBy: context.auth.uid,
    mode,
    statusFilter: mode === "STATUS" ? statusFilter || null : null,
    yardUid,
    total: 0,
    completed: 0,
    successCount: 0,
    failCount: 0,
    currentPlate: null,
    state: "pending",
  });

  return { ok: true, jobId };
});

/**
 * Trigger: when a govSyncJob is created with state "pending", enumerate vehicles and run sync.
 */
export const onGovSyncJobCreated = functions.firestore
  .document("govSyncJobs/{jobId}")
  .onCreate(async (snap, context) => {
    const jobId = context.params.jobId;
    const data = snap.data();
    if (data?.state !== "pending") return;

    await runGovSyncJob(snap.ref, jobId, data.yardUid, data.mode, data.statusFilter);
  });
