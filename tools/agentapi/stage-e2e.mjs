#!/usr/bin/env node
// AGENT-125..128 end-to-end on the emulator with the agentstage build (production Agent code path):
//   Claude MCP host -> TLS relay (10.0.2.2:18443) -> phone app long-poll -> ProductionAgentGateway
//   -> FirebaseTrustedSessionBinder (Auth emulator user) -> existing repositories -> Room.
// The opt-in and pairing are performed through the REAL app UI (uiautomator), never a shortcut.
// Preconditions: emulator-5554 running, Firebase emulators (tools/cloud-dev: npm run emulators + seed),
// dev relay (tools/relay/dev-relay.mjs), agentstage APK built. Never touches a physical device.
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../..");
const adb = path.join(process.env.LOCALAPPDATA, "Android", "Sdk", "platform-tools", "adb.exe");
const SERIAL = process.env.RENTACAR_STAGE_SERIAL || "emulator-5554";
const PKG = "com.rentacar.app.agentstage";
const APK = path.join(repo, "app", "build", "outputs", "apk", "agentstage", "debug", "app-agentstage-debug.apk");
const ACCOUNT = { email: "cloud-dev-owner@example.test", password: "cloud-dev-only-123" }; // tools/cloud-dev/seed.mjs test account
const NAME = "rentcar-device-stage";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " - " + detail : ""}`);
};

if (!SERIAL.startsWith("emulator-")) throw new Error("refusing non-emulator serial");
const sh = (...a) => execFileSync(adb, ["-s", SERIAL, ...a], { encoding: "utf8", timeout: 120000 });

// ---------- UI automation helpers ----------
function dump() {
  let xml = "";
  try {
    execFileSync(adb, ["-s", SERIAL, "shell", "uiautomator", "dump", "/sdcard/rac_ui.xml"], { encoding: "utf8", timeout: 30000 });
    xml = sh("exec-out", "cat", "/sdcard/rac_ui.xml");
  } catch {
    return [];
  }
  const nodes = [];
  for (const m of xml.matchAll(/<node [^>]*>/g)) {
    const a = (k) => (new RegExp(`${k}="([^"]*)"`).exec(m[0]) || [])[1] || "";
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(a("bounds"));
    nodes.push({ text: a("text"), desc: a("content-desc"), checked: a("checked") === "true", x: b ? (+b[1] + +b[3]) >> 1 : 0, y: b ? (+b[2] + +b[4]) >> 1 : 0 });
  }
  return nodes;
}
async function find(pred, { tries = 15, scroll = false } = {}) {
  for (let i = 0; i < tries; i++) {
    const n = dump().find(pred);
    if (n) return n;
    if (scroll) sh("shell", "input", "swipe", "540", "1600", "540", "700", "300");
    await sleep(1000);
  }
  return null;
}
const tap = (n) => sh("shell", "input", "tap", String(n.x), String(n.y));

// ---------- MCP client through the relay ----------
function mcp() {
  const child = spawn(process.execPath, [path.join(repo, "tools", "relay", "run-device-stdio.mjs"), NAME], { stdio: ["pipe", "pipe", "pipe"] });
  let buf = "";
  const waiters = new Map();
  let id = 0;
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const m = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (m.id != null) waiters.get(m.id)?.(m);
    }
  });
  child.stderr.resume();
  const rpc = (method, params) => new Promise((r) => { const my = ++id; waiters.set(my, r); child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: my, method, params }) + "\n"); });
  const call = async (name, args = {}) => { const r = await rpc("tools/call", { name, arguments: args }); return { isError: r.result.isError, body: JSON.parse(r.result.content[0].text) }; };
  return { rpc, call, close: () => child.stdin.end() };
}

// ---------- 1. install + sign in + seed ----------
check("APK built", existsSync(APK), path.relative(repo, APK));
// Fresh install of the STAGING package only (its synthetic data + Keystore keys), for a deterministic run.
try { sh("uninstall", PKG); } catch {}
sh("install", "-t", APK);
check("agentstage installed on emulator only", sh("shell", "pm", "list", "packages", PKG).includes(PKG));
sh("shell", "am", "start", "-n", `${PKG}/com.rentacar.app.MainActivity`);
await sleep(4000);
sh("logcat", "-c");
sh("shell", "am", "broadcast", "-n", `${PKG}/com.rentacar.app.agentstage.AgentStageCommandReceiver`, "-a", "com.rentacar.app.agentstage.SIGN_IN", "--es", "email", ACCOUNT.email, "--es", "password", ACCOUNT.password);
await sleep(5000);
const signLog = sh("logcat", "-d", "-s", "AgentStage:*");
check("signed in to Firebase Auth EMULATOR as test user (non-anonymous)", /SIGNED_IN uid=.* anonymous=false/.test(signLog));
sh("shell", "am", "broadcast", "-n", `${PKG}/com.rentacar.app.agentstage.AgentStageCommandReceiver`, "-a", "com.rentacar.app.agentstage.SEED");
await sleep(4000);
check("synthetic Room rows seeded for that uid", /SEEDED/.test(sh("logcat", "-d", "-s", "AgentStage:*")));

// ---------- 2. owner opt-in + pairing through the real UI ----------
sh("shell", "am", "force-stop", PKG);
sh("shell", "am", "start", "-n", `${PKG}/com.rentacar.app.MainActivity`);
await sleep(6000);
// The app keeps its own login state: sign in through the real login screen with the emulator test account.
const loginBtn = await find((n) => n.text === "כניסה למערכת", { tries: 5 });
if (loginBtn) {
  const email = await find((n) => n.text === "כתובת אימייל");
  tap(email);
  sh("shell", "input", "text", ACCOUNT.email);
  const pw = await find((n) => n.text === "סיסמה");
  tap(pw);
  sh("shell", "input", "text", ACCOUNT.password);
  sh("shell", "input", "keyevent", "111"); // hide keyboard
  tap(await find((n) => n.text === "כניסה למערכת"));
  await sleep(6000);
}
check("logged in through the app's login UI (Auth emulator)", !(await find((n) => n.text === "כניסה למערכת", { tries: 2 })));
// First login of a fresh emulator test account: pick the role that needs no admin approval.
const roleTitle = await find((n) => n.text === "בחר סוג חשבון", { tries: 3 });
if (roleTitle) {
  tap(await find((n) => n.text === "משתמש פרטי"));
  await sleep(800);
  tap(await find((n) => n.text === "שמור והמשך"));
  await sleep(5000);
}
const settings = await find((n) => n.desc === "הגדרות");
check("dashboard reachable (signed-in UI)", settings);
if (settings) tap(settings);
const entry = await find((n) => n.text === "Claude AI — חיבור ושליטה", { scroll: true });
check("Settings shows 'Claude AI — חיבור ושליטה'", entry);
if (entry) tap(entry);
const toggle = await find((n) => n.desc === "claude_access_toggle");
check("access toggle present and OFF by default", toggle && !toggle.checked);
const before = mcp();
await before.rpc("initialize", {});
check("before opt-in: connector reports unavailable (no tools)", (await before.rpc("tools/list", {})).result.tools.length === 1);
before.close();
if (toggle) tap(toggle);
await sleep(1500);
check("toggle ON after owner tap", (await find((n) => n.desc === "claude_access_toggle"))?.checked);
const pairBtn = await find((n) => n.desc === "claude_pair_button", { scroll: true });
if (pairBtn) tap(pairBtn);
const scrollTop = () => { for (let i = 0; i < 3; i++) sh("shell", "input", "swipe", "540", "600", "540", "1700", "300"); };
let codeNode = null;
for (let i = 0; i < 20 && !codeNode; i++) {
  await sleep(1500);
  scrollTop();
  codeNode = dump().find((n) => n.desc.startsWith("claude_pairing_code:"));
}
const code = codeNode?.desc.split(":")[1];
check("one-time pairing code shown on screen", /^[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(code || ""), code ? "XXXXX-XXXXX" : "missing");

// ---------- 3. redeem the code on the PC (decrypts locally) ----------
const pairOut = execFileSync(process.execPath, [path.join(repo, "tools", "relay", "pair.mjs"), code, "--name", NAME, "--no-register"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
check("pair.mjs redeemed code", existsSync(path.join(repo, "build", "relay", `${NAME}.json`)));
const cfg = JSON.parse(readFileSync(path.join(repo, "build", "relay", `${NAME}.json`), "utf8"));
check("token never printed by pair.mjs", !pairOut.includes(cfg.token));
let reuse = 0;
try { execFileSync(process.execPath, [path.join(repo, "tools", "relay", "pair.mjs"), code, "--name", "reuse-check", "--no-register"], { stdio: "ignore" }); } catch (e) { reuse = e.status; }
check("pairing code is single-use", reuse !== 0);

// ---------- 4. Claude MCP -> relay -> phone -> Room ----------
const c = mcp();
const init = await c.rpc("initialize", { protocolVersion: "2025-06-18" });
check("connector labelled DEVELOPMENT_DATA", init.result.serverInfo.dataEnvironment === "DEVELOPMENT_DATA");
let tools = [];
for (let i = 0; i < 20 && tools.length < 2; i++) { tools = (await c.rpc("tools/list", {})).result.tools; if (tools.length < 2) await sleep(2000); }
check("business tools discovered through the relay", tools.length > 30, `${tools.length} tools`);
const s = await c.call("supplier.list", { limit: 50 });
check("TEST A' supplier.list via relay -> app Room", !s.isError && s.body.data.items.map((x) => x.name).sort().join() === "Alpha Rentals,Beta Cars,Gamma Mobility", s.body.metadata?.source);
check("source is ANDROID_LOCAL / LOCAL", s.body.metadata?.executionTarget === "ANDROID_LOCAL" && s.body.metadata?.source === "LOCAL");
const r = await c.call("reservation.list.manage", { limit: 50 });
check("TEST B' reservations via relay", !r.isError && r.body.data.items.length === 6);
const cu = await c.call("customer.list", { limit: 50 });
check("TEST C' customers via relay", !cu.isError && cu.body.data.items.length === 3);
const f = await c.call("commission.summary.totals", { payoutMonth: "2026-05" });
check("TEST D' financial labels via relay", f.body.data?.financialLabel === "CALCULATED_EXPECTED_COMMISSION");
const w = await c.call("supplier.create", { name: "X" });
check("TEST J' write refused (read-only)", w.isError && ["WRITE_NOT_ALLOWED", "UNKNOWN_OPERATION"].includes(w.body.error?.code), w.body.error?.code);
const spoof = await c.call("supplier.list", { userUid: "someone-else" });
check("TEST I' client-supplied userUid refused", spoof.isError && !JSON.stringify(spoof.body).includes("Alpha"), spoof.body.error?.code);

// ---------- 5. revoke + disable from the UI ----------
// Revoke the client paired in THIS run (newest = last in the list).
let revokeBtn = null;
for (let i = 0; i < 6 && !revokeBtn; i++) {
  revokeBtn = dump().filter((n) => n.text === "בטל").pop() || null;
  if (!revokeBtn) sh("shell", "input", "swipe", "540", "1600", "540", "900", "300");
}
if (revokeBtn) tap(revokeBtn);
await sleep(2000);
const afterRevoke = await c.call("supplier.list", {});
check("after UI revoke: token rejected, no data", afterRevoke.isError && afterRevoke.body.data == null, afterRevoke.body.error?.code);
scrollTop();
const t2 = await find((n) => n.desc === "claude_access_toggle", { scroll: false });
if (t2?.checked) tap(t2);
await sleep(2000);
const afterOff = await c.call("supplier.list", {});
check("after opt-out: no data", afterOff.isError && afterOff.body.data == null, afterOff.body.error?.code);
c.close();

const passed = results.filter((x) => x.ok).length;
console.log(JSON.stringify({ passed, failed: results.length - passed }));
process.exit(passed === results.length ? 0 : 1);
