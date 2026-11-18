#!/usr/bin/env node
// AGENT-137/138/139 acceptance on the Android EMULATOR with the agentstage build (production Agent
// code path, synthetic data, Firebase emulator, local TLS relay). Real UI for opt-in/pairing/revoke.
//
// Preconditions: emulator-5554 running; Firebase emulators (tools/cloud-dev: npm run emulators; seeded);
// agentstage APK built. The relay is started/stopped BY THIS SCRIPT (child process) for restart tests.
// Never touches a physical device. Emulator observations are reported as emulator evidence only.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAdbShell, parseUi } from "./adb-shell.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const adb = path.join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe");
const SERIAL = process.env.RENTACAR_STAGE_SERIAL || "emulator-5554";
const PKG = "com.rentacar.app.agentstage";
const RECEIVER = `${PKG}/com.rentacar.app.agentstage.AgentStageCommandReceiver`;
const APK = path.join(repo, "app", "build", "outputs", "apk", "agentstage", "debug", "app-agentstage-debug.apk");
const OWNER = { email: "cloud-dev-owner@example.test", password: "cloud-dev-only-123" }; // tools/cloud-dev/seed.mjs
const OTHER = { email: "cloud-dev-other@example.test", password: "cloud-dev-only-456" };
const NAME = "rentcar-device-stage";
const only = (process.env.ONLY || "").split(",").filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (id, name, ok, detail = "") => {

  results.push({ id, name, ok: !!ok, detail: String(detail ?? "") });
  console.log(`${ok ? "PASS" : "FAIL"} [${id}] ${name}${detail ? " - " + detail : ""}`);
};
if (!SERIAL.startsWith("emulator-")) throw new Error("refusing non-emulator serial");
/** Clean staging install that is VERIFIED (never silently reuses old app data). Emulator, staging package only. */
function freshInstall() {
  // Every adb result is checked explicitly: an error/timeout is never mistaken for "not installed".
  const run = (args, timeout) => {
    for (let i = 0; i < 3; i++) {
      try { return { ok: true, out: execFileSync(adb, ["-s", SERIAL, ...args], { timeout, encoding: "utf8" }).trim() }; }
      catch (e) {
        // A clean non-zero exit (e.g. `pm path` of a missing package exits 1) is an answer, not a transport error.
        if (typeof e.status === "number") return { ok: false, status: e.status, out: String(e.stdout || "").trim() };
        if (i === 2) return { ok: false, out: String(e.message).trim() };
      }
    }
  };
  const installed = () => {
    const r = run(["shell", "pm", "path", PKG], 30000);
    if (r.ok) return r.out.includes("package:");
    if (r.status === 1 && !r.out.includes("package:")) return false;
    throw new Error("cannot determine install state: " + r.out.slice(0, 160));
  };
  const t0 = Date.now();
  for (let i = 0; i < 3 && installed(); i++) {
    const r = run(["uninstall", PKG], 60000);
    if (installed()) console.log(`  uninstall attempt ${i + 1} did not remove the package: ${r.out.slice(0, 120)}`);
  }
  if (installed()) throw new Error("staging package could not be uninstalled; refusing to test on stale app data");
  const r = run(["install", "-t", APK], 180000);
  if (!r.ok || !/Success/.test(r.out)) throw new Error("install failed: " + r.out.slice(0, 200));
  // Verify it is a NEW install (no surviving app data).
  const info = run(["shell", "run-as", PKG, "ls", "shared_prefs"], 30000);
  if (info.ok && info.out && !/No such file/.test(info.out)) throw new Error("fresh install still has shared_prefs: " + info.out.slice(0, 120));
  console.log(`  fresh install verified (${Math.round((Date.now() - t0) / 1000)} s)`);
}

// Bounded adb calls (30 s default; install/reboot get longer explicit timeouts).
const shT = (timeout, ...a) => execFileSync(adb, ["-s", SERIAL, ...a], { encoding: "utf8", timeout });
const ui = createAdbShell(adb, SERIAL, { log: (m) => console.log("  " + m) });
// All device commands go through the persistent, self-healing shell (see adb-shell.mjs).
const q = (x) => (/^[\w@.,:/=+%-]+$/.test(String(x)) ? String(x) : `'${String(x).replace(/'/g, "'\\''")}'`);
const toCmd = (a) => (a[0] === "shell" || a[0] === "exec-out" ? a.slice(1) : a[0] === "logcat" ? a : null);
async function sh(...a) {
  const parts = toCmd(a);
  if (!parts) return shT(60000, ...a); // host-side adb verbs (install/uninstall/reboot/forward)
  const cmd = parts.map(q).join(" ");
  try { return await ui.run(cmd, 30000); }
  catch { return ui.run(cmd, 30000); } // one retry after the session self-heals (commands used here are idempotent or state-checked)
}
const shQuiet = async (...a) => { try { return await sh(...a); } catch { return ""; } };
// Keep the emulator screen on and unlocked while testing (restored at the end).
const keepAwake = async (on) => { await ui.run(`svc power stayon ${on ? "true" : "false"}`, 10000).catch(() => {}); if (on) await ui.run("input keyevent 224; wm dismiss-keyguard", 10000).catch(() => {}); };
// Global watchdog: the whole acceptance run may never hang indefinitely.
const WATCHDOG_MS = Number(process.env.ACCEPTANCE_WATCHDOG_MS || 40 * 60 * 1000);
setTimeout(() => { console.log("FAIL [WATCHDOG] acceptance exceeded " + WATCHDOG_MS / 60000 + " min"); process.exit(3); }, WATCHDOG_MS).unref();
const broadcast = (action, ...extra) => sh("shell", "am", "broadcast", "-n", RECEIVER, "-a", `com.rentacar.app.agentstage.${action}`, ...extra);

// ---------- relay as a child process ----------
let relayProc = null;
const relayLog = [];
async function startRelay() {
  relayProc = spawn(process.execPath, [path.join(repo, "tools", "relay", "dev-relay.mjs")], { stdio: ["ignore", "pipe", "pipe"] });
  relayProc.stdout.on("data", (d) => relayLog.push(String(d)));
  relayProc.stderr.on("data", (d) => relayLog.push(String(d)));
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    if (relayLog.join("").includes("listening")) return;
  }
  throw new Error("relay did not start");
}
async function stopRelay() {
  if (!relayProc) return;
  const p = relayProc;
  relayProc = null;
  p.kill();
  await new Promise((r) => p.on("exit", r));
}

// ---------- UI automation ----------
async function dump(raw = false) {
  // Persistent shell (see adb-shell.mjs); never parse a stale file; require a successful dump.
  try {
    const out = await ui.run("rm -f /sdcard/rac_ui.xml; uiautomator dump /sdcard/rac_ui.xml >/dev/null 2>&1 && cat /sdcard/rac_ui.xml", 30000);
    if (!out.includes("<hierarchy")) { await ui.run("input keyevent 224", 5000).catch(() => {}); return []; }
    return parseUi(out).filter((n) => raw || n.pkg === PKG || n.pkg.includes("permissioncontroller"));
  } catch {
    return [];
  }
}
async function find(pred, tries = 12) {
  for (let i = 0; i < tries; i++) {
    const n = (await dump()).find(pred);
    if (n) return n;
    await sleep(1000);
  }
  return null;
}
const tap = async (n) => { if (n) await ui.run(`input tap ${n.x} ${n.y}`, 10000).catch(() => {}); };

/** Writes actionable diagnostics (no secrets: AgentStage/Auth/Agent log tags only, no business payloads). */
async function diagnose(label) {
  const focus = ((await shQuiet("shell", "dumpsys", "window")).match(/mCurrentFocus=.*/) || [""])[0];
  const nodes = (await dump());
  const logs = await shQuiet("logcat", "-d", "-t", "400", "-s", "AgentStage:*", "AuthViewModel:*", "UserBootstrap:*", "ClaudeAgent:*", "AndroidRuntime:E")
    .split("\n").filter((l) => !/rac1\.|password|Secret/i.test(l)).slice(-40).join("\n");
  const text = `[${new Date().toISOString()}] ${label}\nfocus: ${focus}\nui nodes: ${nodes.length} texts: ${nodes.filter((n) => n.text).map((n) => n.text).slice(0, 15).join(" | ")}\n--- logs ---\n${logs}\n`;
  mkdirSync(path.join(repo, "build", "agentapi-e2e"), { recursive: true });
  writeFileSync(path.join(repo, "build", "agentapi-e2e", `diag-${label.replace(/\W+/g, "_")}.txt`), text);
  return text;
}

/** Bounded readiness check: waits for a UI predicate up to timeoutMs, else records diagnostics and throws. */
async function waitForUi(label, pred, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const n = (await dump()).find(pred);
    if (n) return n;
    await sleep(1000);
  }
  const d = await diagnose(label);
  throw new Error(`UI state '${label}' not reached within ${timeoutMs / 1000}s\n${d}`);
}
const scrollTop = async () => { for (let i = 0; i < 3; i++) await sh("shell", "input", "swipe", "540", "600", "540", "1700", "250"); };
async function openAgentScreen() {
  await sh("shell", "am", "start", "-n", `${PKG}/com.rentacar.app.MainActivity`);
  await sleep(4000);
  await tap(await find((n) => n.desc === "הגדרות"));
  for (let i = 0; i < 6; i++) {
    const e = (await dump()).find((n) => n.text === "Claude AI — חיבור ושליטה");
    if (e) { await tap(e); break; }
    await sh("shell", "input", "swipe", "540", "1600", "540", "700", "300");
  }
  await sleep(1500);
  await scrollTop();
}
async function grantDialogIfShown() {
  const allow = await find((n) => ["Allow", "אפשר", "ALLOW", "Allow all the time"].includes(n.text), 3);
  if (allow) await tap(allow);
}
const status = async () => {
  await shQuiet("logcat", "-c");
  await broadcast("STATUS");
  await sleep(2000);
  return ((await shQuiet("logcat", "-d", "-s", "AgentStage:*")).match(/STATUS .*/g) || []).pop() || "";
};

// ---------- MCP client via the real launcher (sealed E2E transport) ----------
function mcp() {
  const child = spawn(process.execPath, [path.join(repo, "tools", "relay", "run-device-stdio.mjs"), NAME], { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  const waiters = new Map();
  let id = 0;
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      try { const m = JSON.parse(line); if (m.id != null) waiters.get(m.id)?.(m); } catch {}
    }
  });
  child.stderr.resume();
  const rpc = (method, params) => new Promise((r) => { const my = ++id; waiters.set(my, r); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: my, method, params }) + "\n"); });
  const call = async (name, args = {}) => { const r = await rpc("tools/call", { name, arguments: args }); return { isError: r.result.isError, body: JSON.parse(r.result.content[0].text) }; };
  return { rpc, call, close: () => child.stdin.end() };
}
async function readSuppliers(c, attempts = 1, waitMs = 3000) {
  let last;
  for (let i = 0; i < attempts; i++) {
    last = await c.call("supplier.list", { limit: 50 });
    if (!last.isError) return { ok: true, r: last, tries: i + 1 };
    if (i < attempts - 1) await sleep(waitMs);
  }
  return { ok: false, r: last, tries: attempts };
}
const names = (r) => r.body?.data?.items?.map((x) => x.name).sort().join(",");
const FIXTURE = "Alpha Rentals,Beta Cars,Gamma Mobility";

// =====================================================================================
await keepAwake(true);
await startRelay();
try {
  // ---------- setup: fresh staging install, login via UI, seed, opt-in + pair via UI ----------
  freshInstall();
  await sh("shell", "am", "start", "-n", `${PKG}/com.rentacar.app.MainActivity`);
  // Startup must reach a usable screen (login) within a bounded time — never sit on the splash.
  await waitForUi("startup→login", (n) => n.text === "כניסה למערכת", 30000);
  check("S0", "fresh start reaches the login screen (no splash hang)", true);
  // Real login through the app UI (creates the users/{uid} profile via role selection on first login).
  await tap(await waitForUi("login email field", (n) => n.text === "כתובת אימייל")); await sh("shell", "input", "text", OWNER.email);
  await tap(await waitForUi("login password field", (n) => n.text === "סיסמה")); await sh("shell", "input", "text", OWNER.password);
  await sh("shell", "input", "keyevent", "111");
  await tap(await waitForUi("login button", (n) => n.text === "כניסה למערכת"));
  const after = await waitForUi("post-login (role selection or dashboard)", (n) => n.text === "בחר סוג חשבון" || n.desc === "הגדרות", 30000);
  if (after.text === "בחר סוג חשבון") {
    await tap(await waitForUi("role option", (n) => n.text === "משתמש פרטי")); await sleep(1500);
    await tap(await waitForUi("role save", (n) => n.text === "שמור והמשך"));
    await waitForUi("dashboard after role selection", (n) => n.desc === "הגדרות", 30000);
  }
  check("S0", "logged in through the app UI and reached the dashboard", true);
  // Synthetic Room rows for the signed-in uid (agentstage-only receiver), after the profile exists.
  await shQuiet("logcat", "-c");
  await broadcast("SEED");
  await sleep(3000);
  check("S0", "synthetic Room rows seeded for the signed-in uid", /SEEDED/.test(await shQuiet("logcat", "-d", "-s", "AgentStage:*")));
  await openAgentScreen();
  const toggle = await find((n) => n.desc === "claude_access_toggle");
  check("S0", "toggle OFF by default", toggle && !toggle.checked);
  await tap(toggle);
  await grantDialogIfShown();
  await sleep(2500);
  await scrollTop();
  check("S0", "toggle ON after owner tap", (await find((n) => n.desc === "claude_access_toggle"))?.checked);
  await tap(await find((n) => n.desc === "claude_pair_button"));
  let codeNode = null;
  for (let i = 0; i < 20 && !codeNode; i++) { await sleep(1500); await scrollTop(); codeNode = (await dump()).find((n) => n.desc.startsWith("claude_pairing_code:")); }
  const code = codeNode?.desc.split(":")[1];
  check("S0", "pairing code shown", !!code);
  execFileSync(process.execPath, [path.join(repo, "tools", "relay", "pair.mjs"), code, "--name", NAME, "--no-register"], { stdio: "ignore" });
  const cfg = JSON.parse(readFileSync(path.join(repo, "build", "relay", `${NAME}.json`), "utf8"));
  check("S0", "pairing v2: E2E channel key + client credential received", cfg.channelKeyB64 && cfg.clientSecret && cfg.clientId);
  const st0 = await status();
  check("137", "foreground service active after opt-in (notification)", /background=FOREGROUND_SERVICE/.test(st0), st0.match(/state=\S+ background=\S+/)?.[0]);
  const notif = await shQuiet("shell", "dumpsys", "notification", "--noredact");
  check("137", "persistent notification present, no business data", notif.includes("גישת Claude פעילה") && !notif.includes("Alpha Rentals") && !notif.includes(cfg.token));

  let c = mcp();
  await c.rpc("initialize", { protocolVersion: "2025-06-18" });
  // ---------- TEST 1: app open ----------
  let r = await readSuppliers(c, 10);
  check("T1", "app open: paired client reads suppliers (relay E2E → app → Room)", r.ok && names(r.r) === FIXTURE, r.r?.body?.metadata?.source);
  check("T1", "metadata: ANDROID_LOCAL / LOCAL / DEVELOPMENT_DATA", r.r?.body?.metadata?.executionTarget === "ANDROID_LOCAL" && r.r?.body?.connector?.dataEnvironment === "DEVELOPMENT_DATA");
  const relayText = relayLog.join("");
  check("138", "relay audit log has no token, key, client secret or business data", !relayText.includes(cfg.token) && !relayText.includes(cfg.channelKeyB64) && !relayText.includes(cfg.clientSecret) && !relayText.includes("Alpha Rentals"));

  // ---------- TEST 2: backgrounded ----------
  await sh("shell", "input", "keyevent", "3"); // HOME
  await sleep(15000);
  r = await readSuppliers(c, 5);
  check("T2", "app backgrounded (HOME, 15 s): read succeeds via foreground service", r.ok, `tries=${r.tries}`);

  // ---------- TEST 3: screen locked (+ forced Doze, emulator) ----------
  await sh("shell", "input", "keyevent", "223"); // SLEEP
  await sleep(10000);
  r = await readSuppliers(c, 5);
  check("T3", "screen off/locked: read succeeds (emulator)", r.ok, `tries=${r.tries}`);
  await shQuiet("shell", "dumpsys", "battery", "unplug");
  await shQuiet("shell", "dumpsys", "deviceidle", "force-idle");
  await sleep(40000);
  r = await readSuppliers(c, 3, 5000);
  const dozeOk = r.ok;
  check("T3", `forced Doze (deviceidle force-idle): ${dozeOk ? "still reachable" : "unreachable → reported " + (r.r?.body?.error?.code || "?")}`,
    dozeOk || ["DEVICE_UNAVAILABLE", "DEVICE_TIMEOUT"].includes(r.r?.body?.error?.code), "accurate either way; physical-device behaviour must be verified separately");
  await shQuiet("shell", "dumpsys", "deviceidle", "unforce");
  await shQuiet("shell", "dumpsys", "battery", "reset");
  await sh("shell", "input", "keyevent", "224"); // WAKEUP
  await sleep(5000);

  // ---------- TEST 4: network off/on ----------
  await shQuiet("shell", "cmd", "connectivity", "airplane-mode", "enable");
  await sleep(45000);
  r = await readSuppliers(c, 1);
  check("T4", "network down: accurate DEVICE_UNAVAILABLE/TIMEOUT, no data", !r.ok && r.r.body.data == null, r.r?.body?.error?.code);
  await shQuiet("shell", "cmd", "connectivity", "airplane-mode", "disable");
  const t4 = Date.now();
  r = await readSuppliers(c, 30, 2000);
  check("T4", "network restored: automatic recovery", r.ok, `${Math.round((Date.now() - t4) / 1000)} s`);

  // ---------- TEST 5: relay restart ----------
  await stopRelay();
  r = await readSuppliers(c, 1);
  check("T5", "relay down: accurate error, no data", !r.ok && r.r.body.data == null, r.r?.body?.error?.code);
  await sleep(5000);
  await startRelay();
  const t5 = Date.now();
  r = await readSuppliers(c, 40, 2000);
  check("T5", "relay restarted: phone re-registers its clients; same pairing works", r.ok, `${Math.round((Date.now() - t5) / 1000)} s`);

  // ---------- process restart (system kill) ----------
  const pid = (await shQuiet("shell", "pidof", PKG)).trim();
  await shQuiet("shell", "run-as", PKG, "kill", "-9", pid);
  await sleep(3000);
  const t6 = Date.now();
  r = await readSuppliers(c, 40, 3000);
  check("137", "process killed: START_STICKY service restarts and serves again", r.ok, `old pid ${pid}, ${Math.round((Date.now() - t6) / 1000)} s`);

  // ---------- TEST 15: MCP host restart ----------
  c.close();
  c = mcp();
  await c.rpc("initialize", {});
  r = await readSuppliers(c, 5);
  check("T15", "MCP host restarted: reconnects with the stored pairing", r.ok);

  // ---------- TEST 13 + 10 + 11 + 12 + spoof ----------
  const f = await c.call("commission.summary.totals", { payoutMonth: "2026-05" });
  const cs = await c.call("carSale.commission.totals", { commissionFilter: "OPEN" });
  check("T13", "financial reads keep business logic + labels", f.body.data?.financialLabel === "CALCULATED_EXPECTED_COMMISSION" && cs.body.data?.sumRemaining === 1800 && cs.body.data?.financialLabel === "PAYMENT_TRACKED_BALANCE",
    `rental=${f.body.data?.totalCommission} carSaleOpen=${cs.body.data?.sumRemaining}`);
  const w = await c.call("reservation.create", { customerId: 9301 });
  check("T10", "write attempt rejected", w.isError && ["WRITE_NOT_ALLOWED", "UNKNOWN_OPERATION"].includes(w.body.error?.code), w.body.error?.code);
  const sp = await c.call("supplier.list", { userUid: "someone-else" });
  check("T9b", "caller-supplied uid rejected", sp.isError && sp.body.data == null, sp.body.error?.code);

  // ---------- TEST 14: emulator reboot (boot receiver restarts the service without opening the app) ----------
  if (!only.length || only.includes("reboot")) {
    await shQuiet("reboot");
    await sleep(15000);
    for (let i = 0; i < 60; i++) {
      await sleep(5000);
      if ((await shQuiet("shell", "getprop", "sys.boot_completed")).trim() === "1") break;
    }
    const t14 = Date.now();
    r = await readSuppliers(c, 40, 3000);
    check("T14", "emulator reboot: BOOT_COMPLETED restarts the service; data + pairing + opt-in preserved", r.ok && names(r.r) === FIXTURE, `${Math.round((Date.now() - t14) / 1000)} s after boot`);
    const st = await status();
    check("T14", "after reboot: background=FOREGROUND_SERVICE without opening the app", /background=FOREGROUND_SERVICE/.test(st), st.match(/state=\S+ background=\S+/)?.[0]);
  }

  // ---------- TEST 8: sign-out ----------
  await broadcast("SIGN_OUT");
  await sleep(3000);
  r = await readSuppliers(c, 1);
  check("T8", "signed out: remote access refused, no data", !r.ok && r.r.body.data == null, r.r?.body?.error?.code);

  // ---------- TEST 9: different account signs in → previous user's token useless ----------
  await broadcast("SIGN_IN", "--es", "email", OTHER.email, "--es", "password", OTHER.password);
  await sleep(5000);
  r = await readSuppliers(c, 1);
  check("T9", "account changed: old pairing gives no data (SESSION_MISMATCH → revoked)", !r.ok && r.r.body.data == null, r.r?.body?.error?.code);
  await broadcast("SIGN_IN", "--es", "email", OWNER.email, "--es", "password", OWNER.password);
  await sleep(5000);
  r = await readSuppliers(c, 1);
  check("T9", "owner back: the revoked token stays revoked", !r.ok && r.r.body.data == null, r.r?.body?.error?.code);

  // ---------- TEST 7 + 6 on a fresh pairing ----------
  await openAgentScreen();
  await tap(await find((n) => n.desc === "claude_pair_button"));
  codeNode = null;
  for (let i = 0; i < 20 && !codeNode; i++) { await sleep(1500); await scrollTop(); codeNode = (await dump()).find((n) => n.desc.startsWith("claude_pairing_code:")); }
  execFileSync(process.execPath, [path.join(repo, "tools", "relay", "pair.mjs"), codeNode.desc.split(":")[1], "--name", NAME, "--no-register"], { stdio: "ignore" });
  c.close();
  c = mcp();
  await c.rpc("initialize", {});
  r = await readSuppliers(c, 10);
  check("T7", "re-paired client works", r.ok);
  let revokeBtn = null;
  for (let i = 0; i < 6 && !revokeBtn; i++) {
    revokeBtn = (await dump()).filter((n) => n.text === "בטל").pop() || null;
    if (!revokeBtn) await sh("shell", "input", "swipe", "540", "1600", "540", "900", "300");
  }
  await tap(revokeBtn);
  await sleep(1500);
  r = await readSuppliers(c, 1);
  check("T7", "revoked in UI: next request rejected immediately", !r.ok && r.r.body.data == null, r.r?.body?.error?.code);

  // Disable via the NOTIFICATION action (owner control outside the app). Low-importance notifications are
  // shown collapsed (actions hidden): expand the notification first, then tap the action.
  await sh("shell", "cmd", "statusbar", "expand-notifications");
  await sleep(2000);
  const title = (await dump(true)).find((n) => n.pkg === "com.android.systemui" && n.text === "Rent a Car — גישת Claude פעילה");
  if (title) await sh("shell", "input", "swipe", String(title.x), String(title.y), String(title.x), String(title.y + 400), "300");
  await sleep(1500);
  await tap((await dump(true)).find((n) => n.pkg === "com.android.systemui" && n.text === "השבת"));
  await sleep(3000);
  await sh("shell", "cmd", "statusbar", "collapse");
  const st6 = await status();
  check("T6", "notification 'השבת' disables access and stops the service", /enabled=false/.test(st6) && /background=OFF/.test(st6), st6.match(/enabled=\S+/)?.[0]);
  const notif6 = await shQuiet("shell", "dumpsys", "notification", "--noredact");
  check("T6", "notification removed after disable (unredacted check)", !notif6.includes(`pkg=${PKG}`));
  c.close();
} finally {
  await stopRelay();
  await keepAwake(false);
  ui.close();
  const passed = results.filter((x) => x.ok).length;
  mkdirSync(path.join(repo, "build", "agentapi-e2e"), { recursive: true });
  writeFileSync(path.join(repo, "build", "agentapi-e2e", "stage-acceptance.json"), JSON.stringify({ at: new Date().toISOString(), passed, failed: results.length - passed, results }, null, 2));
  console.log(JSON.stringify({ passed, failed: results.length - passed }));
}
