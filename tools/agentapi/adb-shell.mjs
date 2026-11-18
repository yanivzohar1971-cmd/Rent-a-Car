// One persistent `adb shell` session for UI automation.
//
// Why: launching a new adb client per step (uiautomator dump + cat + rm + tap, polled every second)
// put heavy connection churn on the adb server on Windows (4 600+ TIME_WAIT sockets observed on
// 2026-11-18, followed by hanging adb clients). A single long-lived shell uses one connection.
//
// Safety: a command that exceeds its timeout (e.g. a hung `uiautomator dump`) would block every later
// command in the same shell, so on timeout the session is KILLED and transparently re-created.
import { spawn } from "node:child_process";

export function createAdbShell(adb, serial, { log = () => {} } = {}) {
  let child = null;
  let buf = "";
  let current = null;
  let seq = 0;
  let chain = Promise.resolve();
  let restarts = 0;

  function start() {
    buf = "";
    child = spawn(adb, ["-s", serial, "shell"], { stdio: ["pipe", "pipe", "pipe"] });
    child.stderr.resume();
    const me = child;
    me.on("exit", () => {
      if (me !== child) return;
      child = null;
      if (current) {
        const c = current;
        current = null;
        clearTimeout(c.timer);
        c.reject(new Error("adb shell session exited"));
      }
    });
    me.stdout.on("data", (d) => {
      if (me !== child) return;
      buf += d;
      if (!current) return;
      const i = buf.indexOf(current.marker);
      if (i >= 0) {
        const out = buf.slice(0, i);
        buf = buf.slice(i + current.marker.length);
        const c = current;
        current = null;
        clearTimeout(c.timer);
        c.resolve(out);
      }
    });
  }

  function restart(reason) {
    restarts++;
    log(`adb shell session restarted (#${restarts}): ${reason}`);
    const old = child;
    child = null;
    try { old?.kill(); } catch {}
    start();
  }

  /** Runs one shell command line; resolves with its stdout. Bounded by timeoutMs; a timeout resets the session. */
  function run(cmd, timeoutMs = 30000) {
    const job = chain.then(
      () =>
        new Promise((resolve, reject) => {
          if (!child) start();
          const marker = `__RAC_DONE_${++seq}__`;
          const timer = setTimeout(() => {
            current = null;
            restart(`timeout after ${timeoutMs} ms: ${cmd.slice(0, 60)}`);
            reject(new Error(`adb shell command timed out after ${timeoutMs} ms: ${cmd.slice(0, 80)}`));
          }, timeoutMs);
          current = { marker, resolve, reject, timer };
          child.stdin.write(`${cmd} 2>&1; echo ${marker}\n`);
        }),
    );
    chain = job.catch(() => {});
    return job;
  }

  start();
  return {
    run,
    get restarts() { return restarts; },
    close: () => {
      const c = child;
      child = null;
      try { c?.stdin.end("exit\n"); } catch {}
      setTimeout(() => { try { c?.kill(); } catch {} }, 2000).unref();
    },
  };
}

/** Parses a uiautomator XML dump into clickable-center nodes. */
export function parseUi(xml) {
  return [...xml.matchAll(/<node [^>]*>/g)].map((m) => {
    const a = (k) => (new RegExp(`${k}="([^"]*)"`).exec(m[0]) || [])[1] || "";
    const b = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(a("bounds"));
    return { pkg: a("package"), text: a("text"), desc: a("content-desc"), checked: a("checked") === "true", x: b ? (+b[1] + +b[3]) >> 1 : 0, y: b ? (+b[2] + +b[4]) >> 1 : 0 };
  });
}
