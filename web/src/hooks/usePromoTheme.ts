import { useState, useEffect, useRef } from 'react';
import { subscribePromoThemeConfig, DEFAULT_PROMO_THEME_CONFIG, type PromoThemeConfig } from '../api/promoThemeApi';
import { resolvePromoMaterialImageSet, resolvePromoMaterialCssVars, type PromoMaterial } from '../utils/promoMaterialAssets';
import { Timestamp } from 'firebase/firestore';

/**
 * Create initial default config for immediate use (avoid flash)
 */
function getInitialConfig(): PromoThemeConfig {
  return {
    ...DEFAULT_PROMO_THEME_CONFIG,
    updatedAt: Timestamp.now(),
    updatedBy: '',
  };
}

/**
 * Hook to subscribe to live promo theme configuration
 * Returns config and helper functions to resolve assets based on mode
 */
export function usePromoTheme() {
  // Initialize with default config immediately to avoid flash
  const [config, setConfig] = useState<PromoThemeConfig>(getInitialConfig);
  const [loading, setLoading] = useState(true);
  const prevConfigRef = useRef<PromoThemeConfig | null>(null);

  useEffect(() => {
    // Subscribe to live config changes
    const unsubscribe = subscribePromoThemeConfig((cfg) => {
      setConfig(cfg);
      setLoading(false);
      
      // DEV-only: Log config changes
      if (import.meta.env.MODE === 'development') {
        const prev = prevConfigRef.current;
        if (!prev || prev.mode !== cfg.mode || prev.cssPreset !== cfg.cssPreset) {
          console.log('[PROMO_THEME] Config updated:', {
            mode: cfg.mode,
            cssPreset: cfg.cssPreset,
            previous: prev ? { mode: prev.mode, cssPreset: prev.cssPreset } : null,
          });
          prevConfigRef.current = cfg;
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Resolve promo material assets based on current mode
   * Returns CSS variables for CSS mode, or image URLs for other modes
   * 
   * IMPORTANT: CSS mode returns ONLY CSS palette vars (no image vars).
   * Image modes return ONLY image vars (no CSS palette vars).
   */
  const resolvePromoAssets = (
    material: PromoMaterial | null | undefined,
    kind: 'bg-desktop' | 'bg-mobile' | 'btn' = 'bg-desktop'
  ): Record<string, string> => {
    if (!material) {
      return {};
    }

    if (config.mode === 'CSS') {
      // CSS mode: return ONLY CSS palette variables for gradients
      // DO NOT set image vars (--promo-bg-desktop, --promo-bg-mobile, --promo-btn-bg)
      return resolvePromoMaterialCssVars(material, config.cssPreset);
    } else {
      // Image mode (AUTO/AVIF/PNG): return ONLY image URLs
      // DO NOT set CSS palette vars (--promo-css-a, --promo-css-b, --promo-css-c)
      if (kind === 'btn') {
        return {
          '--promo-btn-bg': resolvePromoMaterialImageSet(material, 'btn'),
        };
      } else {
        return {
          '--promo-bg-desktop': resolvePromoMaterialImageSet(material, 'bg-desktop'),
          '--promo-bg-mobile': resolvePromoMaterialImageSet(material, 'bg-mobile'),
        };
      }
    }
  };

  return {
    config,
    loading,
    resolvePromoAssets,
    isCssMode: config?.mode === 'CSS',
  };
}
