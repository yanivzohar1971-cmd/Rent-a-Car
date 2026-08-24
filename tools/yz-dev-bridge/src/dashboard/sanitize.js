import { sanitizeStoreErrorReason } from '../store.js';

const SECRET_KEY_RE = /(?:^|_|-)(token|password|secret|credential|authorization|nonce|apikey|api[_-]?key|private[_-]?key|session[_-]?key|session[_-]?nonce|bearer|cookie|firebase[_-]?key)(?:$|_|-)/i;
const SECRET_KEY_EXACT = new Set([
  'token', 'password', 'secret', 'credential', 'authorization', 'nonce',
  'apiKey', 'api_key', 'privateKey', 'sessionKey', 'sessionNonce',
  'githubToken', 'ghToken', 'firebaseKey', 'chatgptKey', 'authToken',
  'YZ_BRIDGE_API_TOKEN', 'YZ_BRIDGE_GITHUB_TOKEN', 'YZ_BRIDGE_CHATGPT_KEY',
  'YZ_BRIDGE_CHATGPT_SESSION_KEY', 'BRIDGE_AUTH_TOKEN', 'GITHUB_TOKEN', 'GH_TOKEN',
  'bootstrapUrl', 'sessionKey', 'handoffCode',
]);

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /\b(?:\+?\d{1,3}[-.\s])?(?:\(?\d{2,4}\)?[-.\s])?\d{3,4}[-.\s]?\d{4}\b/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const WIN_PATH_RE = /\b[A-Za-z]:\\[^\s'"]+/g;
const UNIX_PATH_RE = /\/(?:Users|home|tmp|var|root)\/[^\s'"]+/g;
const TEMP_FILE_RE = /\b[\w.-]+\.(?:tmp|close-request|outcome\.json)\b/gi;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._\-+/=]+/gi;

export function isSecretKey(key) {
  const name = String(key || '');
  if (!name) return false;
  if (SECRET_KEY_EXACT.has(name)) return true;
  if (/nonce/i.test(name)) return true;
  return SECRET_KEY_RE.test(name);
}

export function sanitizeText(value, { debug = false } = {}) {
  let text = String(value ?? '');
  if (!text) return '';
  text = text.replace(BEARER_RE, 'Bearer <redacted>');
  text = text.replace(EMAIL_RE, '<email>');
  text = text.replace(PHONE_RE, '<phone>');
  text = text.replace(UUID_RE, '<uuid>');
  text = text.replace(TEMP_FILE_RE, '<temp>');
  if (!debug) {
    text = text.replace(WIN_PATH_RE, '<path>');
    text = text.replace(UNIX_PATH_RE, '<path>');
  }
  if (text.length > 400) text = `${text.slice(0, 397)}...`;
  return text;
}

export function sanitizeErrorMessage(value) {
  return sanitizeStoreErrorReason(value);
}

function sanitizeArray(value, options) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeValue(item, options)).filter((item) => item !== undefined);
}

export function sanitizeValue(value, options = {}) {
  const debug = Boolean(options.debug);
  if (value == null) return value;
  if (typeof value === 'string') return sanitizeText(value, { debug });
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return sanitizeArray(value, options);
  if (typeof value === 'object') return sanitizeObject(value, options);
  return sanitizeText(String(value), { debug });
}

export function sanitizeObject(input, options = {}) {
  if (!input || typeof input !== 'object') return input;
  const out = Array.isArray(input) ? [] : {};
  for (const [key, value] of Object.entries(input)) {
    if (isSecretKey(key)) continue;
    if (key === 'file' && /session|agent|tmp/i.test(String(options.context || 'session'))) continue;
    if (key === 'env' || key === 'processEnv' || key === 'headers') continue;
    out[key] = sanitizeValue(value, { ...options, context: key });
  }
  return out;
}

export function publicAgentSession(session, { debug = false } = {}) {
  if (!session || typeof session !== 'object') return null;
  const pid = Number(session.pid);
  const view = {
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    startedAt: session.startedAt ? String(session.startedAt) : null,
    registeredAt: session.registeredAt ? String(session.registeredAt) : null,
    taskId: session.taskId ? String(session.taskId) : null,
    live: session.live === true ? true : (session.live === false ? false : null),
  };
  if (debug) {
    view.workspacePresent = Boolean(session.workspace);
  }
  return view;
}
