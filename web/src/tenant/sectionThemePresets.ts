import type {
  TenantSectionBackgroundMode,
  TenantSectionCardStyle,
  TenantSectionTextTone,
} from './tenantSiteConfig';

/** Built-in section “look” presets (additive; resolved in {@link resolveEffectiveSectionStyle}). */
export type SectionThemePresetDefinition = {
  id: string;
  /** Short Hebrew label for builder UI */
  label: string;
  backgroundMode: TenantSectionBackgroundMode;
  textTone: TenantSectionTextTone;
  /** Solid surface override; null = rely on backgroundMode + hive only */
  sectionBackgroundColor: string | null;
  accentBaseColor: string;
  cardStyle?: TenantSectionCardStyle;
};

const P: SectionThemePresetDefinition[] = [
  { id: 'paper-classic', label: 'נייר קלאסי', backgroundMode: 'default', textTone: 'default', sectionBackgroundColor: '#ffffff', accentBaseColor: '#0284c7' },
  { id: 'cloud-cool', label: 'ענן קריר', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#f1f5f9', accentBaseColor: '#0ea5e9' },
  { id: 'mist-slate', label: 'ערפל אפור', backgroundMode: 'soft', textTone: 'default', sectionBackgroundColor: null, accentBaseColor: '#64748b' },
  { id: 'quartz-warm', label: 'קוורץ חמים', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#fafaf9', accentBaseColor: '#b45309' },
  { id: 'sand-beach', label: 'חול חוף', backgroundMode: 'soft', textTone: 'default', sectionBackgroundColor: null, accentBaseColor: '#d97706' },
  { id: 'linen-natural', label: 'פשתן טבעי', backgroundMode: 'default', textTone: 'muted', sectionBackgroundColor: '#faf7f2', accentBaseColor: '#78716c' },
  { id: 'olive-garden', label: 'זית גן', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#f7fee7', accentBaseColor: '#4d7c0f' },
  { id: 'sea-glass', label: 'זכוכית ים', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#ecfeff', accentBaseColor: '#0891b2' },
  { id: 'dusk-indigo', label: 'דמדומים', backgroundMode: 'soft', textTone: 'default', sectionBackgroundColor: null, accentBaseColor: '#4338ca' },
  { id: 'midnight-ink', label: 'חצות', backgroundMode: 'default', textTone: 'inverse', sectionBackgroundColor: '#0f172a', accentBaseColor: '#38bdf8', cardStyle: 'soft' },
  { id: 'charcoal-soft', label: 'פחמים רך', backgroundMode: 'default', textTone: 'inverse', sectionBackgroundColor: '#1e293b', accentBaseColor: '#94a3b8', cardStyle: 'elevated' },
  { id: 'rose-blush', label: 'ורוד עדין', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#fff1f2', accentBaseColor: '#e11d48' },
  { id: 'coral-warmth', label: 'אלמוג חם', backgroundMode: 'soft', textTone: 'default', sectionBackgroundColor: null, accentBaseColor: '#f97316' },
  { id: 'amber-glow', label: 'ענבר זוהר', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#fffbeb', accentBaseColor: '#d97706' },
  { id: 'honey-butter', label: 'דבש', backgroundMode: 'default', textTone: 'default', sectionBackgroundColor: '#fffbeb', accentBaseColor: '#ca8a04' },
  { id: 'sage-calm', label: 'מרווה רגוע', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#f0fdf4', accentBaseColor: '#15803d' },
  { id: 'mint-fresh', label: 'מנטה רענן', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#ecfdf5', accentBaseColor: '#059669' },
  { id: 'teal-deep', label: 'טיל עמוק', backgroundMode: 'accent', textTone: 'default', sectionBackgroundColor: null, accentBaseColor: '#0d9488' },
  { id: 'cyan-breeze', label: 'ציאן נשימה', backgroundMode: 'soft', textTone: 'default', sectionBackgroundColor: null, accentBaseColor: '#06b6d4' },
  { id: 'cobalt-classic', label: 'קובלט קלאסי', backgroundMode: 'default', textTone: 'default', sectionBackgroundColor: '#eff6ff', accentBaseColor: '#2563eb' },
  { id: 'violet-soft', label: 'סיגלון רך', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#f5f3ff', accentBaseColor: '#7c3aed' },
  { id: 'plum-rich', label: 'שזיף עשיר', backgroundMode: 'default', textTone: 'inverse', sectionBackgroundColor: '#3b0764', accentBaseColor: '#c084fc', cardStyle: 'outline' },
  { id: 'ruby-bold', label: 'אודם מודגש', backgroundMode: 'accent', textTone: 'default', sectionBackgroundColor: null, accentBaseColor: '#be123c' },
  { id: 'crimson-dark', label: 'ארגמן כהה', backgroundMode: 'default', textTone: 'inverse', sectionBackgroundColor: '#450a0a', accentBaseColor: '#fb7185', cardStyle: 'soft' },
  { id: 'forest-deep', label: 'יער עמוק', backgroundMode: 'default', textTone: 'inverse', sectionBackgroundColor: '#14532d', accentBaseColor: '#86efac', cardStyle: 'elevated' },
  { id: 'moss-earth', label: 'טחב אדמה', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#f7fee7', accentBaseColor: '#365314' },
  { id: 'copper-accent', label: 'נחושת', backgroundMode: 'soft', textTone: 'default', sectionBackgroundColor: null, accentBaseColor: '#b45309' },
  { id: 'steel-tech', label: 'פלדה טק', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#f8fafc', accentBaseColor: '#475569' },
  { id: 'graphite-minimal', label: 'גרפיט מינימלי', backgroundMode: 'default', textTone: 'muted', sectionBackgroundColor: '#fafafa', accentBaseColor: '#404040' },
  { id: 'ivory-elegant', label: 'שנהב אלגנטי', backgroundMode: 'default', textTone: 'default', sectionBackgroundColor: '#fffff7', accentBaseColor: '#a16207' },
  { id: 'slate-corporate', label: 'אפור ארגוני', backgroundMode: 'surface', textTone: 'default', sectionBackgroundColor: '#f1f5f9', accentBaseColor: '#334155', cardStyle: 'outline' },
  { id: 'gold-luxury', label: 'זהב יוקרה', backgroundMode: 'default', textTone: 'default', sectionBackgroundColor: '#fafaf9', accentBaseColor: '#b45309', cardStyle: 'elevated' },
];

const BY_ID = new Map<string, SectionThemePresetDefinition>(P.map((x) => [x.id, x]));

export const SECTION_THEME_PRESET_LIST: readonly SectionThemePresetDefinition[] = P;

export function getSectionThemePresetById(id: string | null | undefined): SectionThemePresetDefinition | null {
  if (id == null) return null;
  const k = String(id).trim();
  if (!k) return null;
  return BY_ID.get(k) ?? null;
}
