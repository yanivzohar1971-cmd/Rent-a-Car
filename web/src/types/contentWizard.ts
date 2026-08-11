/**
 * Content Wizard Types
 * Types for the Admin Content Generator (Monster Wizard)
 */

export interface WizardBrief {
  version: 'wizardBrief.v1';
  createdAt: string; // ISO string
  type: string;
  audience: string[];
  goal: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  location: string[];
  vehicleSegments: string[];
  structureBlocks: string[];
  tone: string;
  length: {
    preset: 'short' | 'medium' | 'long' | 'custom';
    customWords: number | null;
  };
  notes: string;
}

export interface GeneratedContent {
  title: string;
  slug: string;
  summary: string;
  tags: string[];
  publishedAt: string; // YYYY-MM-DD
  updatedAt: string; // YYYY-MM-DD
  contentMarkdown: string;
  faq?: Array<{
    q: string;
    a: string;
  }>;
}

export interface ContentDraft {
  id?: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
  brief: WizardBrief;
  generated?: GeneratedContent | string; // Can be JSON object or markdown string
  status: 'DRAFT' | 'PUBLISHED';
}
