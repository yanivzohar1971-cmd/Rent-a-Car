# SEO Placeholder Image

This directory contains `seo-placeholder.png` at exactly **1200×630 pixels**.

## Current Status

- `seo-placeholder.svg` - SVG source file (edit this to change the design)
- `seo-placeholder.png` - **AUTO-GENERATED** during build (do not edit manually)

## Auto-Generation

The PNG is automatically generated from the SVG during the web build process via `prebuild` script.

- **Script**: `web/scripts/gen-seo-placeholder.mjs`
- **Tool**: `@resvg/resvg-js` (converts SVG to PNG)
- **Trigger**: Runs automatically before `npm run build` via `prebuild` hook

### Manual Generation (if needed)

If you need to regenerate the PNG manually:
```bash
npm run gen:seo-placeholder
```

### Requirements
- **Dimensions**: Exactly 1200×630 pixels (OpenGraph recommended size)
- **Format**: PNG
- **File size**: Keep under 150KB if possible
- **Content**: Branded design with CarExpert branding

## Usage

The SEO renderer (`functions/src/seo.ts`) automatically uses this image as fallback when:
- Car/yard listing has no image
- Image URL is invalid or cannot be normalized
- Image fetch fails

The image URL will be: `https://yourdomain.com/seo-placeholder.png`
