import { getPresetByKey } from './sectionColorPresets';
import { normalizeAccentBaseColor } from './sectionHivePalette';
import { getThemeBrandPresetByKey } from './themeBrandPresets';

export type ThemeAccentStrategyMode = 'none' | 'preset' | 'derived';

export type ThemeAccentTargetScope = 'all' | 'contentOnly' | 'cardsOnly';

export type ThemeAccentIntensity = 'soft' | 'balanced' | 'strong';

/** Persisted under `branding.theme.accentStrategy`; `null` on branding means “follow pack / no explicit row”. */
export type NormalizedThemeAccentStrategy = {
  mode: ThemeAccentStrategyMode;
  presetKey: string | null;
  baseColor: string | null;
  targetSections: ThemeAccentTargetScope;
  intensity: ThemeAccentIntensity;
};

const TARGETS = new Set<ThemeAccentTargetScope>(['all', 'contentOnly', 'cardsOnly']);
const INTENSITIES = new Set<ThemeAccentIntensity>(['soft', 'balanced', 'strong']);
const MODES = new Set<ThemeAccentStrategyMode>(['none', 'preset', 'derived']);

export const THEME_ACCENT_STRATEGY_NONE: NormalizedThemeAccentStrategy = {
  mode: 'none',
  presetKey: null,
  baseColor: null,
  targetSections: 'all',
  intensity: 'balanced',
};

function pickMode(raw: unknown): ThemeAccentStrategyMode | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim() as ThemeAccentStrategyMode;
  return MODES.has(m) ? m : null;
}

function pickTarget(raw: unknown): ThemeAccentTargetScope {
  if (typeof raw !== 'string') return 'all';
  const t = raw.trim() as ThemeAccentTargetScope;
  return TARGETS.has(t) ? t : 'all';
}

function pickIntensity(raw: unknown): ThemeAccentIntensity {
  if (typeof raw !== 'string') return 'balanced';
  const i = raw.trim() as ThemeAccentIntensity;
  return INTENSITIES.has(i) ? i : 'balanced';
}

function asTrimmedNullableString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t || null;
}

/**
 * Parse Firestore / API `branding.theme.accentStrategy`.
 * - `null`/missing → `null` on normalized branding (follow pack default at runtime).
 * - Invalid shape → `null` (safe).
 */
export function parsePersistedThemeAccentStrategy(raw: unknown): NormalizedThemeAccentStrategy | null {
  if (raw == null || raw === undefined) return null;
  if (typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const mode = pickMode(r.mode) ?? 'none';
  const presetKey = asTrimmedNullableString(r.presetKey);
  const baseColorRaw = asTrimmedNullableString(r.baseColor);
  const baseColor = baseColorRaw ? normalizeAccentBaseColor(baseColorRaw) : null;
  return {
    mode,
    presetKey,
    baseColor,
    targetSections: pickTarget(r.targetSections),
    intensity: pickIntensity(r.intensity),
  };
}

export function normalizePackAccentStrategy(
  partial: {
    mode?: ThemeAccentStrategyMode | null;
    presetKey?: string | null;
    baseColor?: string | null;
    targetSections?: ThemeAccentTargetScope | null;
    intensity?: ThemeAccentIntensity | null;
  } | null | undefined,
  packPrimary: string | null | undefined,
): NormalizedThemeAccentStrategy | null {
  if (!partial || typeof partial !== 'object') return null;
  const mode = pickMode(partial.mode);
  if (!mode || mode === 'none') return null;
  const presetKey = asTrimmedNullableString(partial.presetKey);
  const base = asTrimmedNullableString(partial.baseColor);
  const baseColor = base ? normalizeAccentBaseColor(base) : null;
  const primaryNorm = packPrimary ? normalizeAccentBaseColor(String(packPrimary)) : null;
  const out: NormalizedThemeAccentStrategy = {
    mode,
    presetKey,
    baseColor: baseColor ?? primaryNorm,
    targetSections: pickTarget(partial.targetSections),
    intensity: pickIntensity(partial.intensity),
  };
  if (out.mode === 'preset') {
    if (!out.presetKey || !getPresetByKey(out.presetKey)) return null;
  }
  if (out.mode === 'derived') {
    if (!out.baseColor) return null;
  }
  return out;
}

export type BrandingAccentStrategyInput = {
  siteThemePackKey: string | null;
  themeAccentStrategy: NormalizedThemeAccentStrategy | null;
  primaryColor: string | null;
  /** Frozen pack accent when snapshot matches pack key; avoids live registry drift. */
  appliedThemeSnapshot?: {
    packKey: string;
    accentStrategyFromPack: NormalizedThemeAccentStrategy | null;
  } | null;
};

function frozenPackAccentMatches(s: BrandingAccentStrategyInput): NormalizedThemeAccentStrategy | null {
  const snap = s.appliedThemeSnapshot;
  if (!snap || !s.siteThemePackKey || snap.packKey !== s.siteThemePackKey.trim()) return null;
  const f = snap.accentStrategyFromPack;
  if (!f || f.mode === 'none') return null;
  if (f.mode === 'preset') {
    if (f.presetKey && getPresetByKey(f.presetKey)) return f;
    return null;
  }
  const primary = s.primaryColor ? normalizeAccentBaseColor(s.primaryColor) : null;
  const base = f.baseColor ?? primary;
  if (!base) return null;
  return { ...f, baseColor: base };
}

/** Effective site-level accent strategy: persisted row wins; otherwise frozen pack accent; otherwise live pack default. */
export function getEffectiveThemeAccentStrategy(branding: BrandingAccentStrategyInput): NormalizedThemeAccentStrategy {
  if (branding.themeAccentStrategy != null) {
    const s = branding.themeAccentStrategy;
    if (s.mode === 'none') return THEME_ACCENT_STRATEGY_NONE;
    if (s.mode === 'preset') {
      if (s.presetKey && getPresetByKey(s.presetKey)) return s;
      return THEME_ACCENT_STRATEGY_NONE;
    }
    const primary = branding.primaryColor ? normalizeAccentBaseColor(branding.primaryColor) : null;
    const base = s.baseColor ?? primary;
    if (!base) return THEME_ACCENT_STRATEGY_NONE;
    return { ...s, baseColor: base };
  }
  const frozen = frozenPackAccentMatches(branding);
  if (frozen) return frozen;
  const pack = branding.siteThemePackKey ? getThemeBrandPresetByKey(branding.siteThemePackKey) : null;
  const fromPack = normalizePackAccentStrategy(pack?.accentStrategy, pack?.primaryColor);
  return fromPack ?? THEME_ACCENT_STRATEGY_NONE;
}

export function serializeThemeAccentStrategyForFirestore(
  s: NormalizedThemeAccentStrategy | null,
): Record<string, unknown> | null {
  if (s == null) return null;
  const o: Record<string, unknown> = {
    mode: s.mode,
    targetSections: s.targetSections,
    intensity: s.intensity,
  };
  if (s.presetKey) o.presetKey = s.presetKey;
  if (s.baseColor) o.baseColor = s.baseColor;
  return o;
}
