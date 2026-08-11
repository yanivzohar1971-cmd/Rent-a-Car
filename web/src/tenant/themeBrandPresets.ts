import type { TenantSectionStyle } from './tenantSiteConfig';

/** Bump when pack defaults meaningfully change; pairs with frozen `appliedThemeSnapshot.packVersion`. */
export const THEME_BRAND_REGISTRY_VERSION = 1;

/** Curated site-wide branding direction (colors + section tendencies). Not the same as section `colorPreset` (hive). */
export type ThemeBrandPreset = {
  key: string;
  labelHe: string;
  moodHe: string;
  /** Monotonic per pack; frozen on tenant when theme colors/pack are applied. */
  packVersion: number;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  /**
   * Optional default accent strategy when tenant has no explicit `branding.theme.accentStrategy`.
   * Applied only for sections that inherit the site theme and have no local hive preset/custom.
   */
  accentStrategy?: {
    mode?: 'none' | 'preset' | 'derived' | null;
    presetKey?: string | null;
    baseColor?: string | null;
    targetSections?: 'all' | 'contentOnly' | 'cardsOnly' | null;
    intensity?: 'soft' | 'balanced' | 'strong' | null;
  };
  /** Safe, partial section defaults merged under the global theme contract */
  sectionDefaults?: Partial<
    Pick<
      TenantSectionStyle,
      | 'backgroundMode'
      | 'textTone'
      | 'paddingDensity'
      | 'cardStyle'
      | 'layoutVariant'
      | 'align'
    >
  >;
};

const PRESET_BY_KEY: Record<string, ThemeBrandPreset> = {};

function reg(p: Omit<ThemeBrandPreset, 'packVersion'> & { packVersion?: number }): ThemeBrandPreset {
  const full = { packVersion: 1, ...p } as ThemeBrandPreset;
  PRESET_BY_KEY[full.key] = full;
  return full;
}

export const THEME_BRAND_PRESETS: ThemeBrandPreset[] = [
  reg({
    key: 'clean',
    labelHe: 'נקי ומינימליסטי',
    moodHe: 'לבן, אויר, אמון — מתאים לכל סוכרות',
    primaryColor: '#0369a1',
    secondaryColor: '#0c4a6e',
    accentColor: '#38bdf8',
    sectionDefaults: { backgroundMode: 'default', textTone: 'default', paddingDensity: 'md', cardStyle: 'default' },
  }),
  reg({
    key: 'bold',
    labelHe: 'בולט ואנרגטי',
    moodHe: 'נוכחות חזקה — קידום ומבצעים',
    primaryColor: '#c2410c',
    secondaryColor: '#9a3412',
    accentColor: '#fb923c',
    sectionDefaults: { backgroundMode: 'soft', textTone: 'default', paddingDensity: 'md', cardStyle: 'elevated' },
  }),
  reg({
    key: 'luxury',
    labelHe: 'יוקרה עדינה',
    moodHe: 'כהה וזהב — פרימיום ללא צעקנות',
    primaryColor: '#1c1917',
    secondaryColor: '#292524',
    accentColor: '#ca8a04',
    sectionDefaults: { backgroundMode: 'surface', textTone: 'default', paddingDensity: 'lg', cardStyle: 'soft' },
  }),
  reg({
    key: 'ocean',
    labelHe: 'אוקיינוס',
    moodHe: 'כחול מרגיע — שקט וביטחון',
    primaryColor: '#0369a1',
    secondaryColor: '#075985',
    accentColor: '#0ea5e9',
    sectionDefaults: { backgroundMode: 'surface', textTone: 'default', paddingDensity: 'md', cardStyle: 'outline' },
  }),
  reg({
    key: 'mono',
    labelHe: 'מונוכרום מודרני',
    moodHe: 'אפור ושחור — הפרדה ברורה בין קטעים',
    primaryColor: '#334155',
    secondaryColor: '#1e293b',
    accentColor: '#64748b',
    sectionDefaults: { backgroundMode: 'surface', textTone: 'default', paddingDensity: 'md', cardStyle: 'default' },
  }),
  reg({
    key: 'warm',
    labelHe: 'חמים וידידותי',
    moodHe: 'טון חם — קהל משפחתי',
    primaryColor: '#b45309',
    secondaryColor: '#92400e',
    accentColor: '#fbbf24',
    sectionDefaults: { backgroundMode: 'soft', textTone: 'default', paddingDensity: 'md', cardStyle: 'soft' },
  }),
  reg({
    key: 'showroom',
    labelHe: 'חלון ראווה',
    moodHe: 'בהיר, מרווח — דגש על רכבים ותמונות',
    primaryColor: '#0f172a',
    secondaryColor: '#1e293b',
    accentColor: '#38bdf8',
    sectionDefaults: {
      backgroundMode: 'default',
      textTone: 'default',
      paddingDensity: 'lg',
      layoutVariant: 'default',
      cardStyle: 'elevated',
    },
  }),
];

export function getThemeBrandPresetByKey(key: string | null | undefined): ThemeBrandPreset | null {
  if (key == null || typeof key !== 'string') return null;
  const k = key.trim();
  return k ? PRESET_BY_KEY[k] ?? null : null;
}
