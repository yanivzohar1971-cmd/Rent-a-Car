/** UTF-8 BOM (U+FEFF). PowerShell Set-Content -Encoding utf8 writes this prefix. */
export const UTF8_BOM = '\uFEFF';

export function stripUtf8Bom(text) {
  const raw = String(text ?? '');
  return raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw;
}

/**
 * Parse JSON after stripping a leading UTF-8 BOM only.
 * Does not attempt to repair unrelated malformed JSON.
 */
export function parseJsonBomSafe(text, { source = 'json' } = {}) {
  const stripped = stripUtf8Bom(text);
  try {
    return JSON.parse(stripped);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const err = new Error(`Invalid JSON in ${source}: ${message}`);
    err.cause = error;
    err.code = 'YZ_BRIDGE_INVALID_JSON';
    err.jsonSource = source;
    err.hadUtf8Bom = String(text ?? '').charCodeAt(0) === 0xfeff;
    throw err;
  }
}

export function isJsonBomParseError(error) {
  if (!error) return false;
  if (error.code === 'YZ_BRIDGE_INVALID_JSON' && error.hadUtf8Bom) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /\uFEFF|Unexpected token ['"]?\uFEFF|BOM/i.test(message);
}
