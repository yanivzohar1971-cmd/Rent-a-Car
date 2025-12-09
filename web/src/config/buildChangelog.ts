// IMPORTANT (AI / Cursor / humans):
// This changelog powers the Build Info Center in the UI.
// Do NOT remove BUILD_CHANGELOG or replace it with placeholders.
// New builds should be PREPENDED (newest first), keeping the current build at index 0.
// See web/docs/AI_GLOBAL_RULES.md – "Build Info Center – Must Always Exist".

// web/src/config/buildChangelog.ts
import { BUILD_ENV, BUILD_LABEL, BUILD_VERSION } from './buildInfo';

export interface BuildChangeItem {
  type: 'feature' | 'bugfix' | 'ui' | 'infra' | 'other';
  title: string;
  description?: string;
}

export interface BuildEntry {
  version: string;     // e.g. "2025.12.09-01"
  label: string;       // e.g. "v2025.12.09-01"
  env: string;         // "production" | "staging" | "local" | etc.
  topic: string;       // short title in Hebrew or English
  timestamp: string;   // ISO string or "YYYY-MM-DD HH:mm:ss" – displayed as-is
  summary?: string;    // one-line summary
  changes?: BuildChangeItem[];
}

/**
 * Build Changelog
 * 
 * NOTE:
 * - The FIRST entry in this array MUST always be the CURRENT build.
 * - CI/CD can prepend a new entry per deploy before running `npm run build`.
 * - To add a new build: prepend a new BuildEntry object at the top of the array.
 * 
 * CI Integration:
 * - CI can set VITE_DEPLOY_VERSION and VITE_DEPLOY_ENV environment variables
 * - CI can prepend a new entry with version, topic, summary, and changes
 * - After prepending, run `npm run build` and deploy
 */
export const BUILD_CHANGELOG: BuildEntry[] = [
  // CURRENT BUILD - Robust public car linking + accurate image count
  {
    version: BUILD_VERSION,
    label: BUILD_LABEL,
    env: BUILD_ENV,
    topic: 'Robust public car linking + accurate image count',
    timestamp: '2025-12-09 20:00:00',
    summary: 'Fixed "car not found" from Facebook share links and image count=0 bug in Yard Fleet. Added validation to prevent broken URLs.',
    changes: [
      {
        type: 'bugfix',
        title: 'Robust public car linking',
        description: 'Added verifyPublicCarExists() validation before generating /cars/:id URLs. getEffectivePublicCarId now verifies publicCars doc exists, preventing "הרכב לא נמצא" from Smart Publish links.'
      },
      {
        type: 'bugfix',
        title: 'Accurate image count in yard fleet',
        description: 'Image counts now reflect real image availability from publicCars and carSales, including legacy fields. Added safety check to force imageCount when publicCars has imageUrls but count is 0.'
      },
      {
        type: 'infra',
        title: 'Public car validation',
        description: 'New verifyPublicCarExists() helper in carsApi.ts ensures share URLs only use valid publicCars document IDs.'
      },
      {
        type: 'infra',
        title: 'Enhanced image normalization',
        description: 'Improved merging of publicCars and carSales image data in yardFleetApi, ensuring all field variants are passed to normalizeCarImages().'
      }
    ]
  },
  // Previous build: Fix main image and image count in yard fleet
  {
    version: '2025.12.09-04',
    label: 'v2025.12.09-04',
    env: 'production',
    topic: 'Fix main image and image count in yard fleet',
    timestamp: '2025-12-09 15:20:00',
    summary: 'Fixed empty main image rendering in CarImageGallery and imageCount=0 bug in Yard Fleet list.',
    changes: [
      {
        type: 'bugfix',
        title: 'Main image rendering',
        description: 'Fixed CarImageGallery to properly display main image (was showing empty gradient). Now renders <img> directly when selectedUrl exists.'
      },
      {
        type: 'bugfix',
        title: 'Image count from publicCars',
        description: 'Strengthened publicCars ↔ carSales mapping to use ALL candidate keys. imageCount now correctly reflects publicCars.imageUrls when available.'
      },
      {
        type: 'infra',
        title: 'Multi-key mapping',
        description: 'addPublicCarToMap now maps each publicCars doc under all relevant keys (carSaleId, originalCarId, carId, id, publicCarId) for robust linking.'
      }
    ]
  },
  // Previous deploy: Fix yard car image gallery & Facebook links
  {
    version: '2025.12.09-03',
    label: 'v2025.12.09-03',
    env: 'production',
    topic: 'Fix yard car image gallery & Facebook links',
    timestamp: '2025-12-09 14:30:00',
    summary: 'Fixed main image selection, added zoom overlay, unified image loading from publicCars.',
    changes: [
      {
        type: 'feature',
        title: 'Image Zoom Overlay',
        description: 'Clicking main image opens full-screen zoom overlay with ESC/backdrop close support.'
      },
      {
        type: 'bugfix',
        title: 'Robust image selection',
        description: 'CarImageGallery now properly selects mainImageUrl on load, falls back to first image.'
      },
      {
        type: 'bugfix',
        title: 'YardFleet preview from publicCars',
        description: 'Preview dialog now loads images from publicCars (same as public car page), ensuring consistency.'
      },
      {
        type: 'infra',
        title: 'Facebook share verified',
        description: 'Confirmed Facebook share uses getEffectivePublicCarId with Firestore fallback resolution.'
      }
    ]
  },
  // Previous deploy: Build Info Center + AI Governance Layer
  {
    version: '2025.12.09-02',
    label: 'v2025.12.09-02',
    env: 'production',
    topic: 'Deploy – Build Info Center + AI Governance Layer',
    timestamp: '2025-12-09 12:10:00',
    summary: 'Added Build Info Center, footer version label, and AI governance docs for all future AI work.',
    changes: [
      {
        type: 'feature',
        title: 'Build Info Center',
        description: 'Footer "Build Info" button opens modal dialog showing current and historical builds.'
      },
      {
        type: 'infra',
        title: 'AI Governance Docs',
        description: 'Added AI_GLOBAL_RULES.md and CURSOR_MASTER_PROMPT.md to guide all future AI/Cursor work on this repo.'
      },
      {
        type: 'ui',
        title: 'Footer version label',
        description: 'BUILD_LABEL displayed in footer as system version indicator (RTL-friendly).'
      },
      {
        type: 'infra',
        title: 'Build changelog module',
        description: 'TypeScript-based BUILD_CHANGELOG array for version history (no DB yet).'
      },
      {
        type: 'infra',
        title: 'MASTER BUILD RULES',
        description: 'AI agents must treat Topic/Summary as Build Log material and output BuildEntry templates for deploys.'
      }
    ]
  },
  // Previous build entry
  {
    version: '2025.12.09-01',
    label: 'v2025.12.09-01',
    env: 'local',
    topic: 'Build Info Center - מרכז מידע גרסאות',
    timestamp: '2025-12-09 11:15:00',
    summary: 'הוספת מרכז מידע גרסאות עם היסטוריית שינויים.',
    changes: [
      {
        type: 'feature',
        title: 'מודל Build Info',
        description: 'דיאלוג מודרני להצגת גרסה נוכחית והיסטוריה.'
      },
      {
        type: 'ui',
        title: 'כפתור Build Info בפוטר',
        description: 'כפתור קטן ליד הגרסה לפתיחת המודל.'
      },
      {
        type: 'infra',
        title: 'מודול buildChangelog.ts',
        description: 'מבנה נתונים typed להיסטוריית גרסאות.'
      }
    ]
  },
  {
    version: '2025.12.09-00',
    label: 'v2025.12.09-00',
    env: 'local',
    topic: 'Build Version Indicator - הושלם',
    timestamp: '2025-12-09 11:07:00',
    summary: 'הוספת גרסת BUILD לפוטר ולוג גרסה בקונסול.',
    changes: [
      {
        type: 'feature',
        title: 'הצגת גרסת מערכת בפוטר',
        description: 'תווית vXXXX עם תמיכה ב-RTL ו-LTR למספרים.'
      },
      {
        type: 'infra',
        title: 'לוג גרסה בקונסול',
        description: 'הדפסת BUILD_LABEL ו-BUILD_ENV בתחילת טעינת האפליקציה.'
      }
    ]
  },
  // Older builds go here, newest first (descending by date).
  // CI/CD or manual editing should prepend new entries above.
];

/**
 * Get the current build entry (first in the changelog)
 */
export function getCurrentBuild(): BuildEntry | undefined {
  return BUILD_CHANGELOG[0];
}

/**
 * Get historical builds (all except the current one)
 */
export function getBuildHistory(): BuildEntry[] {
  return BUILD_CHANGELOG.slice(1);
}

