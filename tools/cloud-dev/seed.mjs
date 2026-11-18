#!/usr/bin/env node
// AGENT-129: idempotent synthetic seed for the isolated Firebase emulator (demo-* project only).
// Creates two emulator users (owner + other tenant) and writes CLOUD MIRROR documents in the same
// collections/field shapes CloudDeltaSyncWorker uploads. Records are clearly synthetic
// ("Cloud Delta ...", example.test) and deliberately differ from the AgentDev Room fixtures so a
// test can tell which source answered.
import { encodeValue } from "./cloud-gateway.mjs";

export const DEV_USERS = {
  owner: { email: "cloud-dev-owner@example.test", password: "cloud-dev-only-123" },
  other: { email: "cloud-dev-other@example.test", password: "cloud-dev-only-456" },
};

const T0 = Date.UTC(2026, 0, 1);
const day = 86400000;

export const OWNER_DATA = {
  suppliers: [
    { id: 8001, name: "Cloud Delta Rentals", address: "10 Delta St, Tel Aviv", taxId: "520000001", phone: "03-5558001", email: "ops@delta.example.test", defaultHold: 2500, fixedHold: null, commissionDays1to6: 14, commissionDays7to23: 9, commissionDays24plus: 6, createdAt: T0, updatedAt: T0 },
    { id: 8002, name: "Cloud Epsilon Cars", address: "20 Epsilon Rd, Haifa", taxId: "520000002", phone: "04-5558002", email: "ops@epsilon.example.test", defaultHold: 2000, fixedHold: 1500, commissionDays1to6: null, commissionDays7to23: null, commissionDays24plus: null, createdAt: T0, updatedAt: T0 },
  ],
  customers: [
    { id: 8301, firstName: "Avi", lastName: "Cloud", phone: "054-0008301", tzId: "000000018", address: "synthetic", email: "avi.cloud@example.test", isCompany: false, active: true, createdAt: T0, updatedAt: T0 },
    { id: 8302, firstName: "Maya", lastName: "Mirror", phone: "054-0008302", tzId: "000000026", address: "synthetic", email: null, isCompany: true, active: true, createdAt: T0, updatedAt: T0 },
  ],
  reservations: [
    { id: 8401, customerId: 8301, supplierId: 8001, branchId: 8101, carTypeId: 8201, carTypeName: "Economy", agentId: null, dateFrom: T0 + 40 * day, dateTo: T0 + 45 * day, actualReturnDate: null, includeVat: true, vatPercentAtCreation: null, airportMode: false, agreedPrice: 1500, kmIncluded: 1000, requiredHoldAmount: 2500, periodTypeDays: 1, commissionPercentUsed: null, status: "Confirmed", isClosed: false, supplierOrderNumber: "ORD-DELTA-1", externalContractNumber: "EXT-D-1", notes: null, isQuote: false, createdAt: T0, updatedAt: T0 },
    { id: 8402, customerId: 8302, supplierId: 8002, branchId: 8102, carTypeId: 8202, carTypeName: "SUV", agentId: null, dateFrom: T0 + 60 * day, dateTo: T0 + 70 * day, actualReturnDate: T0 + 70 * day, includeVat: true, vatPercentAtCreation: null, airportMode: false, agreedPrice: 4200, kmIncluded: 1500, requiredHoldAmount: 2000, periodTypeDays: 1, commissionPercentUsed: null, status: "Paid", isClosed: true, supplierOrderNumber: "ORD-EPS-1", externalContractNumber: null, notes: null, isQuote: false, createdAt: T0, updatedAt: T0 },
  ],
  carSales: [
    { id: 8501, firstName: "Ron", lastName: "Cloudsale", phone: "052-8501", carTypeName: "Used Sedan", saleDate: T0 + 20 * day, salePrice: 80000, commissionPrice: 1800, notes: null, createdAt: T0, updatedAt: T0 },
    { id: 8502, firstName: "Gal", lastName: "Cloudsale", phone: "052-8502", carTypeName: "Used SUV", saleDate: T0 + 25 * day, salePrice: 120000, commissionPrice: 2500, notes: null, createdAt: T0, updatedAt: T0 },
  ],
  carSaleCommissionPayments: [{ id: 8601, carSaleId: 8502, amount: 1000, paymentDate: T0 + 30 * day, createdAt: T0, updatedAt: T0 }],
};

export const OTHER_DATA = {
  suppliers: [{ id: 7001, name: "Other Tenant Secret Supplier", address: "x", taxId: "x", phone: "x", email: "x@example.test", defaultHold: 0, fixedHold: null, createdAt: T0, updatedAt: T0 }],
};

async function ensureUser(authHost, { email, password }) {
  const base = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts`;
  const post = (path, body) =>
    fetch(`${base}:${path}?key=demo-api-key`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, body: await r.json() }));
  let r = await post("signUp", { email, password, returnSecureToken: true });
  if (!r.ok && r.body?.error?.message === "EMAIL_EXISTS") r = await post("signInWithPassword", { email, password, returnSecureToken: true });
  if (!r.ok) throw new Error(`auth emulator user ${email}: ${r.body?.error?.message}`);
  return r.body.localId;
}

async function writeDoc(firestoreHost, projectId, path, data) {
  // "Bearer owner" is the emulator-only admin credential; it does not exist in production.
  const url = `http://${firestoreHost}/v1/projects/${projectId}/databases/(default)/documents/${path}`;
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encodeValue(v)]));
  const r = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" }, body: JSON.stringify({ fields }) });
  if (!r.ok) throw new Error(`seed ${path}: HTTP ${r.status} ${await r.text()}`);
}

export async function seed({ projectId, firestoreHost, authHost }) {
  if (!/^demo-/.test(projectId)) throw new Error("seed refuses non-demo projects");
  const ownerUid = await ensureUser(authHost, DEV_USERS.owner);
  const otherUid = await ensureUser(authHost, DEV_USERS.other);
  for (const [uid, data] of [[ownerUid, OWNER_DATA], [otherUid, OTHER_DATA]]) {
    for (const [collection, rows] of Object.entries(data)) {
      for (const row of rows) await writeDoc(firestoreHost, projectId, `users/${uid}/${collection}/${row.id}`, row);
    }
  }
  return { ownerUid, otherUid };
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/").replace(/^\/?/, "/")}` || process.argv[1]?.endsWith("seed.mjs")) {
  const projectId = process.env.RENTACAR_CLOUD_DEV_PROJECT || "demo-rentacar-agent";
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:18080";
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:19099";
  const r = await seed({ projectId, firestoreHost, authHost });
  process.stderr.write(`seeded ${projectId}: owner=${r.ownerUid.slice(0, 6)}… other=${r.otherUid.slice(0, 6)}…\n`);
}
