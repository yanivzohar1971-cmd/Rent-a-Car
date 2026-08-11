/**
 * Hand count (מספר יד) normalization and display.
 * - Unknown: "00" | "0" | empty | null | NaN | 99 | <1 | >20 => null.
 * - Valid range: integers 1..20 only.
 */

const HAND_MIN = 1;
const HAND_MAX = 20;

export function normalizeHandCount(raw: unknown): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === "" || s === "00" || s === "0") return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < HAND_MIN || n > HAND_MAX || n === 99) return null;
  return n;
}

export function formatHandCountHe(raw: unknown): string {
  const n = normalizeHandCount(raw);
  return n != null ? `יד ${n}` : "לא צוין";
}
