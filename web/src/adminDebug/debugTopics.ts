/**
 * Admin Debug Topics Registry
 * 
 * This file defines the topic-based organization for the DEBUG ADMIN screen.
 * Each topic represents a logical grouping of debug checks with:
 * - Availability predicate (determines if topic is shown based on context)
 * - Control IDs to run
 * - UI metadata (label, icon, description)
 * 
 * DEV NOTES:
 * - Topics are defined in TOPIC_DEFINITIONS array
 * - Availability is checked via isAvailable(ctx) function
 * - Context signals: hasYard, hasCar, superAdmin
 * - To add a new topic: add to TOPIC_DEFINITIONS with availability predicate
 * - Results state is stored in localStorage per topic
 */

import type { DebugContext, DebugResult } from './debugControls';

export interface TopicContext {
  hasYard: boolean;
  hasCar: boolean;
  superAdmin: boolean;
  yardUid?: string;
  carId?: string;
}

export interface TopicDefinition {
  key: string;
  label: string;
  icon: string;
  description: string;
  prerequisites: string[];
  // Determines if topic should be shown in current context
  isAvailable: (ctx: TopicContext) => boolean;
  // Control IDs to run for this topic (from debugControls.ts)
  controlIds: string[];
  // Optional: custom render for results
  customResultsRender?: boolean;
}

/**
 * Topic Definitions
 * 
 * Each topic maps to one or more debug controls and has an availability predicate.
 */
export const TOPIC_DEFINITIONS: TopicDefinition[] = [
  {
    key: 'scenario-runner',
    label: 'Scenario Runner (Safe Read-Only Only)',
    icon: '🎯',
    description: 'Runs safe read-only controls across different selection scenarios. Never runs destructive actions.',
    prerequisites: [],
    isAvailable: () => true, // Always available, but enforces read-only scenarios only
    controlIds: [], // Special case - uses custom scenario logic
    customResultsRender: true,
  },
  {
    key: 'pipeline',
    label: 'Pipeline',
    icon: '🔄',
    description: 'Check publish pipeline: MASTER state, PUBLIC projection, diff, seller exposure',
    prerequisites: ['Yard OR Car selected'],
    isAvailable: (ctx) => ctx.hasYard || ctx.hasCar,
    controlIds: [
      'master-car-state',
      'public-car-state',
      'master-public-diff',
      'yard-published-counts',
      'seller-exposure-diagnosis',
    ],
  },
  {
    key: 'functions-projection',
    label: 'Functions/Projection',
    icon: '⚡',
    description: 'Test reprojection, functions latency, projection preview, and snapshot rebuild',
    prerequisites: ['Yard OR Car selected'],
    isAvailable: (ctx) => ctx.hasYard || ctx.hasCar,
    controlIds: [
      'reproject-car',
      'reproject-yard',
      'functions-latency',
      'public-projection-preview',
      'rebuild-publiccar-snapshot', // NEW: Rebuild seller/yard snapshot
    ],
  },
  {
    key: 'queries-backward-compat',
    label: 'Queries & Backward Compatibility',
    icon: '🔍',
    description: 'Test public listing queries, detect old docs missing isPublished',
    prerequisites: [],
    isAvailable: () => true, // Always available
    controlIds: [
      'public-listing-query',
      'detect-old-docs',
    ],
  },
  {
    key: 'data-integrity',
    label: 'Data Integrity',
    icon: '🔧',
    description: 'Scan for missing fields, misaligned publish signals, repair data issues',
    prerequisites: ['Yard OR Car selected'],
    isAvailable: (ctx) => ctx.hasYard || ctx.hasCar,
    controlIds: [
      'master-undefined-scan',
      'publish-signal-scan',
      'repair-missing-fields',
      'repair-selected-car',
    ],
  },
  {
    key: 'performance-sampling',
    label: 'Performance / Sampling',
    icon: '⏱️',
    description: 'Measure functions latency and sampling performance',
    prerequisites: [],
    isAvailable: () => true, // Always available
    controlIds: [
      'functions-latency',
    ],
  },
  {
    key: 'publication-visibility',
    label: 'Publication & Visibility',
    icon: '👁️',
    description: 'Check public car existence, eligibility, and visibility reasons',
    prerequisites: ['Yard OR Super Admin'],
    isAvailable: (ctx) => ctx.hasYard || ctx.superAdmin,
    controlIds: [
      'public-car-exists',
      'why-car-not-public',
      'public-projection-preview',
      'public-ui-eligibility',
    ],
  },
  {
    key: 'diagnostics',
    label: 'Diagnostics',
    icon: '🩺',
    description: 'Deep diagnostics: seller snapshots, exposure flags, write permissions',
    prerequisites: ['Yard OR Car OR Super Admin'],
    isAvailable: (ctx) => ctx.hasYard || ctx.hasCar || ctx.superAdmin,
    controlIds: [
      'seller-snapshot-raw',
      'exposure-effective',
      'write-permission-probe',
    ],
  },
  {
    key: 'ui-sanity',
    label: 'UI Sanity',
    icon: '🎨',
    description: 'Check UI eligibility and public display logic',
    prerequisites: [],
    isAvailable: () => true, // Always available
    controlIds: [
      'public-ui-eligibility',
    ],
  },
];

/**
 * Get available topics based on current context
 */
export function getAvailableTopics(ctx: TopicContext): TopicDefinition[] {
  return TOPIC_DEFINITIONS.filter(topic => topic.isAvailable(ctx));
}

/**
 * Get topic by key
 */
export function getTopicByKey(key: string): TopicDefinition | undefined {
  return TOPIC_DEFINITIONS.find(topic => topic.key === key);
}

/**
 * Build TopicContext from DebugContext
 */
export function buildTopicContext(debugCtx: DebugContext, superAdmin: boolean = false): TopicContext {
  return {
    hasYard: !!debugCtx.yardUid,
    hasCar: !!debugCtx.carId,
    superAdmin,
    yardUid: debugCtx.yardUid,
    carId: debugCtx.carId,
  };
}

/**
 * LocalStorage keys
 */
export const STORAGE_KEYS = {
  LAST_SELECTED_TOPIC: 'debug-admin-last-topic',
  TOPIC_RESULTS: 'debug-admin-topic-results',
  TOPIC_INPUTS: 'debug-admin-topic-inputs',
};

/**
 * Persist last selected topic
 */
export function saveLastSelectedTopic(topicKey: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_SELECTED_TOPIC, topicKey);
  } catch (error) {
    console.warn('[DebugTopics] Failed to save last selected topic:', error);
  }
}

/**
 * Load last selected topic
 */
export function loadLastSelectedTopic(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.LAST_SELECTED_TOPIC);
  } catch (error) {
    console.warn('[DebugTopics] Failed to load last selected topic:', error);
    return null;
  }
}

/**
 * Save topic results to localStorage (keep last 5 runs per topic)
 */
export function saveTopicResults(topicKey: string, results: DebugResult[]): void {
  try {
    const allResults = loadAllTopicResults();
    const topicHistory = allResults[topicKey] || [];
    
    // Add new results with timestamp
    const newEntry = {
      timestamp: new Date().toISOString(),
      results,
    };
    
    // Keep last 5 runs
    topicHistory.unshift(newEntry);
    if (topicHistory.length > 5) {
      topicHistory.splice(5);
    }
    
    allResults[topicKey] = topicHistory;
    localStorage.setItem(STORAGE_KEYS.TOPIC_RESULTS, JSON.stringify(allResults));
  } catch (error) {
    console.warn('[DebugTopics] Failed to save topic results:', error);
  }
}

/**
 * Load all topic results from localStorage
 */
export function loadAllTopicResults(): Record<string, Array<{ timestamp: string; results: DebugResult[] }>> {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.TOPIC_RESULTS);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('[DebugTopics] Failed to load topic results:', error);
    return {};
  }
}

/**
 * Load results for specific topic
 */
export function loadTopicResults(topicKey: string): Array<{ timestamp: string; results: DebugResult[] }> {
  const allResults = loadAllTopicResults();
  return allResults[topicKey] || [];
}
