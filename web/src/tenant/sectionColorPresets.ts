export type SectionColorPreset = {
  key: string;
  label: string;
  baseColor: string;
};

export const PRESET_LIST: readonly SectionColorPreset[] = [
  { key: 'ocean', label: 'אוקיינוס', baseColor: '#0284c7' },
  { key: 'sunset', label: 'שקיעה', baseColor: '#ea580c' },
  { key: 'forest', label: 'יער', baseColor: '#15803d' },
  { key: 'royal', label: 'ארגמן', baseColor: '#6d28d9' },
  { key: 'mono', label: 'ניטרלי', baseColor: '#64748b' },
  { key: 'gold', label: 'זהב', baseColor: '#b45309' },
] as const;

const PRESET_BY_KEY: ReadonlyMap<string, SectionColorPreset> = new Map(
  PRESET_LIST.map((p) => [p.key, p] as const),
);

export function getPresetByKey(key: string): SectionColorPreset | undefined {
  const k = key.trim();
  if (!k) return undefined;
  return PRESET_BY_KEY.get(k);
}
