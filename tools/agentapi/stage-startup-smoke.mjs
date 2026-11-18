#!/usr/bin/env node
// Startup smoke test (emulator, agentstage): the app must always leave the splash screen within a
// bounded time. Reproduces the 2026-11-18 splash hang:
//   a signed-in Firebase user with NO users/{uid} profile → app forces logout → next process start has
//   no user → background anonymous debug sign-in completes after checkExistingUser() → (before fix)
//   LoggedIn + no profile → SplashScreen forever.
// Also verifies startup is unaffected when Agent access is ON and the relay is DOWN.
// Preconditions: emulator-5554, Firebase emulators running + seeded, agentstage APK built.
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAdbShell, parseUi } from "./adb-shell.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const adb = path.join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe");
const SERIAL = "emulator-5554";
const PKG = "com.rentacar.app.agentstage";
const RECEIVER = `${PKG}/com.rentacar.app.agentstage.AgentStageCommandReceiver`;
const APK = path.join(repo, "app", "build", "outputs", "apk", "agentstage", "debug", "app-agentstage-debug.apk");
const OWNER = { email: "cloud-dev-owner@example.test", password: "cloud-dev-only-123" };
const NOPROFILE = { email: "cloud-dev-noprofile@example.test", password: "cloud-dev-only-789" };
const STARTUP_BUDGET_MS = 45000; // bounded; includes uiautomator latency (each dump ~1-2 s, some fail transiently)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
setTimeout(() => { console.log("FAIL [WATCHDOG] smoke exceeded 15 min"); process.exit(3); }, 15 * 60 * 1000).unref();
// Keep the emulator screen on and unlocked while testing (restored at the end).
const keepAwake = async (on) => { await ui.run(`svc power stayon ${on ? "true" : "false"}`, 10000).catch(() => {}); if (on) await ui.run("input keyevent 224; wm dismiss-keyguard", 10000).catch(() => {}); };
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " - " + detail : ""}`); };

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
async function waitFor(pred, ms) {
  const t0 = Date.now();
  let failedDumps = 0;
  while (Date.now() - t0 < ms) {
    const nodes = (await dump());
    if (!nodes.length) failedDumps++;
    const n = nodes.find(pred);
    if (n) return { n, ms: Date.now() - t0, failedDumps };
    await sleep(1500);
  }
  return { n: null, ms: Date.now() - t0, nodes: (await dump()).length, failedDumps };
}
const tap = async (n) => { if (n) await ui.run(`input tap ${n.x} ${n.y}`, 10000).catch(() => {}); };
const usable = (n) => n.text === "כניסה למערכת" || n.desc === "הגדרות" || n.text === "בחר סוג חשבון";
async function coldStart() {
  await shQuiet("shell", "am", "force-stop", PKG);
  await sh("shell", "am", "start", "-n", `${PKG}/com.rentacar.app.MainActivity`);
  return waitFor(usable, STARTUP_BUDGET_MS);
}

// Auth-emulator account WITHOUT a Firestore profile (reproduces the forced-logout path).
await fetch("http://127.0.0.1:19099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...NOPROFILE, returnSecureToken: true }),
}).catch(() => {});

await keepAwake(true);
freshInstall();

let r = await coldStart();
check("fresh install: leaves splash → login", r.n?.text === "כניסה למערכת", `${r.ms} ms`);

// Reproduction of the hang.
await sh("shell", "am", "broadcast", "-n", RECEIVER, "-a", "com.rentacar.app.agentstage.SIGN_IN", "--es", "email", NOPROFILE.email, "--es", "password", NOPROFILE.password);
await sleep(6000); // app detects missing profile and forces logout
for (let i = 1; i <= 3; i++) {
  r = await coldStart();
  check(`after forced logout, cold start #${i}: usable screen (not splash)`, !!r.n, r.n ? `${r.n.text || r.n.desc} in ${r.ms} ms` : `still ${r.nodes} nodes after ${r.ms} ms`);
}

// Agent access ON with the relay DOWN must not affect startup.
const step = async (label, pred, ms = STARTUP_BUDGET_MS) => {
  const w = await waitFor(pred, ms);
  if (!w.n) console.log(`  (waited ${w.ms} ms for ${label}; nodes=${w.nodes})`);
  return w.n;
};
r = await coldStart();
if (r.n?.text === "כניסה למערכת") {
  await tap(await step("email field", (n) => n.text === "כתובת אימייל"));
  await shQuiet("shell", "input", "text", OWNER.email);
  await tap(await step("password field", (n) => n.text === "סיסמה"));
  await shQuiet("shell", "input", "text", OWNER.password);
  await shQuiet("shell", "input", "keyevent", "111");
  await tap(await step("login button", (n) => n.text === "כניסה למערכת"));
}
let landing = await step("role selection or dashboard", (n) => n.text === "בחר סוג חשבון" || n.desc === "הגדרות");
if (landing?.text === "בחר סוג חשבון") {
  await tap(await step("role option", (n) => n.text === "משתמש פרטי"));
  await tap(await step("role save", (n) => n.text === "שמור והמשך"));
  landing = await step("dashboard", (n) => n.desc === "הגדרות");
}
check("owner login via UI reaches dashboard", landing?.desc === "הגדרות");
await tap(landing);
let entry = null;
for (let i = 0; i < 6 && !entry; i++) {
  entry = (await dump()).find((n) => n.text === "Claude AI — חיבור ושליטה");
  if (!entry) await shQuiet("shell", "input", "swipe", "540", "1600", "540", "700", "300");
}
await tap(entry);
await step("agent screen", (n) => n.text === "Claude AI — חיבור ושליטה");
for (let i = 0; i < 3; i++) await shQuiet("shell", "input", "swipe", "540", "600", "540", "1700", "250");
const toggle = await step("access toggle", (n) => n.desc === "claude_access_toggle", 15000);
if (toggle && !toggle.checked) await tap(toggle);
await tap(await step("notification permission dialog", (n) => ["Allow", "אפשר"].includes(n.text), 5000));
await sleep(2000);
// relay is NOT running in this script
for (let i = 1; i <= 2; i++) {
  r = await coldStart();
  check(`access ON + relay DOWN, cold start #${i}: dashboard usable`, r.n?.desc === "הגדרות", r.n ? `${r.ms} ms` : `nodes=${r.nodes}, failed uiautomator dumps=${r.failedDumps}`);
}
await shQuiet("logcat", "-c");
await sh("shell", "am", "broadcast", "-n", RECEIVER, "-a", "com.rentacar.app.agentstage.STATUS");
await sleep(2500);
const st = ((await shQuiet("logcat", "-d", "-s", "AgentStage:*")).match(/STATUS .*/g) || []).pop() || "";
check("relay down is reported, not fatal (service running, state RELAY_UNREACHABLE/CONNECTING)",
  /background=FOREGROUND_SERVICE/.test(st) && /state=(RELAY_UNREACHABLE|CONNECTING)/.test(st), st.match(/state=\S+ background=\S+/)?.[0]);
const crashes = await shQuiet("logcat", "-d", "-b", "crash");
check("no crash in the crash buffer for agentstage", !crashes.includes(PKG));

await keepAwake(false);
ui.close();
const passed = results.filter((x) => x.ok).length;
console.log(JSON.stringify({ passed, failed: results.length - passed }));
process.exit(passed === results.length ? 0 : 1);
