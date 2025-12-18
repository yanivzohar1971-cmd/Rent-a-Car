import { useState, useEffect } from 'react';
import { getPromoThemeConfig, type PromoThemeConfig } from '../api/promoThemeApi';
import { resolvePromoMaterialImageSet, resolvePromoMaterialCssVars, type PromoMaterial } from '../utils/promoMaterialAssets';

/**
 * Hook to fetch and use promo theme configuration
 * Returns config and helper functions to resolve assets based on mode
 */
export function usePromoTheme() {
  const [config, setConfig] = useState<PromoThemeConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    getPromoThemeConfig()
      .then((cfg) => {
        if (mounted) {
          setConfig(cfg);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error('Error loading promo theme config:', error);
        if (mounted) {
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Resolve promo material assets based on current mode
   * Returns CSS variables for CSS mode, or image URLs for other modes
   */
  const resolvePromoAssets = (
    material: PromoMaterial | null | undefined,
    kind: 'bg-desktop' | 'bg-mobile' | 'btn' = 'bg-desktop'
  ): Record<string, string> => {
    if (!material || !config) {
      return {};
    }

    if (config.mode === 'CSS') {
      // CSS mode: return CSS variables for gradients
      return resolvePromoMaterialCssVars(material, config.cssPreset);
    } else {
      // Image mode: return image URLs
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
