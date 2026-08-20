import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { accessSync, constants, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const PROJECT_ID = 'carexpert-94faa';
const DEFAULT_KEY_PATH = resolve(__dirname, '../../adminDebug/keys/carexpert-94faa-sa.json');

export function initializeAdmin({ projectId = PROJECT_ID, preferAdc = false } = {}) {
  if (getApps().length > 0) {
    return {
      app: getApps()[0],
      auth: getAuth(),
      db: getFirestore(),
      storage: getStorage(),
    };
  }

  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim();
  const keyPath = envPath || (existsSync(DEFAULT_KEY_PATH) ? DEFAULT_KEY_PATH : null);

  // Prefer ADC for Auth-capable local tooling when requested.
  if (preferAdc) {
    try {
      initializeApp({
        credential: applicationDefault(),
        projectId,
        storageBucket: `${projectId}.firebasestorage.app`,
      });
      return {
        app: getApps()[0],
        auth: getAuth(),
        db: getFirestore(),
        storage: getStorage(),
        authMode: 'ADC',
      };
    } catch {
      // fall through to service account
    }
  }

  if (keyPath) {
    accessSync(keyPath, constants.R_OK);
    const serviceAccount = JSON.parse(readFileSync(keyPath, 'utf8'));
    if (!serviceAccount.project_id || !serviceAccount.private_key || !serviceAccount.client_email) {
      throw new Error('Invalid Service Account key format');
    }
    initializeApp({
      credential: cert(serviceAccount),
      projectId,
      storageBucket: `${projectId}.firebasestorage.app`,
    });
    return {
      app: getApps()[0],
      auth: getAuth(),
      db: getFirestore(),
      storage: getStorage(),
      authMode: 'SERVICE_ACCOUNT_KEY',
    };
  }

  initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket: `${projectId}.firebasestorage.app`,
  });
  return {
    app: getApps()[0],
    auth: getAuth(),
    db: getFirestore(),
    storage: getStorage(),
    authMode: 'ADC',
  };
}
