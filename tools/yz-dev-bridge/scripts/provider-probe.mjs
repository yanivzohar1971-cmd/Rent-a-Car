#!/usr/bin/env node
/**
 * Provider capability probe CLI (read-only).
 * Does not enable SDK/ACP for production projects.
 */
import { createLegacyExecutionProvider } from '../src/execution/providers/legacyProvider.js';
import { probeCursorSdk } from '../src/execution/providers/cursorSdkProvider.js';
import { probeCursorAcp } from '../src/execution/providers/cursorAcpProvider.js';
import { ExecutionRouter } from '../src/execution/router.js';

const router = new ExecutionRouter({
  providers: {
    legacy: createLegacyExecutionProvider({}),
  },
  featureFlags: {
    v2RouterEnabled: true,
    allowSdk: false,
    allowAcp: false,
    allowAuto: false,
  },
});

const report = {
  at: new Date().toISOString(),
  legacy: await router.getProvider('legacy').probe(),
  'cursor-sdk': await probeCursorSdk(),
  'cursor-acp': await probeCursorAcp(),
  productionDefault: 'legacy',
  autoRouting: 'OFF',
};

console.log(JSON.stringify(report, null, 2));
