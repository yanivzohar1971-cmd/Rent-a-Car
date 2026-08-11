#!/usr/bin/env node
/**
 * PSI Audit Script - Identifies failing best-practices audits
 * 
 * Usage: node scripts/audit-psi.mjs [url]
 * Default URL: https://carexpert-94faa.web.app
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TARGET_URL = process.argv[2] || 'https://carexpert-94faa.web.app';

console.log(`🔍 Running PSI audit on: ${TARGET_URL}\n`);

try {
  // Check if lighthouse CLI is available
  try {
    execSync('lighthouse --version', { stdio: 'ignore' });
  } catch {
    console.error('❌ Lighthouse CLI not found. Install with: npm install -g lighthouse');
    console.log('\n📋 Alternative: Use PageSpeed Insights API or Chrome DevTools Lighthouse tab');
    process.exit(1);
  }

  // Run Lighthouse audit
  console.log('⏳ Running Lighthouse audit (this may take 30-60 seconds)...\n');
  
  const output = execSync(
    `lighthouse "${TARGET_URL}" --only-categories=best-practices --output=json --quiet --chrome-flags="--headless --no-sandbox"`,
    { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );

  const report = JSON.parse(output);
  
  // Extract best-practices score
  const bpScore = report.categories?.['best-practices']?.score;
  const bpScorePercent = bpScore ? Math.round(bpScore * 100) : null;
  
  console.log(`\n📊 Best Practices Score: ${bpScorePercent ?? 'N/A'} / 100\n`);
  
  // Find failing audits (score < 1.0)
  const audits = report.audits || {};
  const failingAudits = Object.entries(audits)
    .filter(([_, audit]) => {
      if (!audit || audit.score === null || audit.score === undefined) return false;
      return audit.score < 1.0;
    })
    .map(([id, audit]) => ({
      id,
      title: audit.title,
      description: audit.description,
      score: audit.score,
      scoreDisplayMode: audit.scoreDisplayMode,
      details: audit.details,
    }))
    .sort((a, b) => (a.score || 0) - (b.score || 0));

  if (failingAudits.length === 0) {
    console.log('✅ All best-practices audits passed!\n');
  } else {
    console.log(`❌ Found ${failingAudits.length} failing audit(s):\n`);
    
    failingAudits.forEach((audit, index) => {
      const scorePercent = audit.score !== null ? Math.round(audit.score * 100) : 'N/A';
      console.log(`${index + 1}. ${audit.title}`);
      console.log(`   ID: ${audit.id}`);
      console.log(`   Score: ${scorePercent}%`);
      if (audit.description) {
        console.log(`   Description: ${audit.description.substring(0, 150)}...`);
      }
      console.log('');
    });
  }

  // Also check for specific known issues
  const knownIssues = [
    'errors-in-console',
    'missing-source-maps',
    'is-on-https',
    'uses-http2',
    'no-vulnerable-libraries',
  ];

  console.log('\n🔍 Checking specific audits:\n');
  knownIssues.forEach(issueId => {
    const audit = audits[issueId];
    if (audit) {
      const score = audit.score !== null ? Math.round(audit.score * 100) : 'N/A';
      const status = audit.score === 1.0 ? '✅' : '❌';
      console.log(`${status} ${audit.title}: ${score}%`);
    }
  });

  console.log('\n📝 Summary:');
  console.log(`   Overall BP Score: ${bpScorePercent ?? 'N/A'}/100`);
  console.log(`   Failing Audits: ${failingAudits.length}`);
  
  if (failingAudits.length > 0) {
    console.log('\n💡 Next steps:');
    console.log('   1. Review failing audits above');
    console.log('   2. Fix issues in codebase');
    console.log('   3. Re-run this script to verify');
  }

} catch (error) {
  console.error('❌ Error running audit:', error.message);
  if (error.message.includes('lighthouse')) {
    console.log('\n💡 Install Lighthouse CLI: npm install -g lighthouse');
  }
  process.exit(1);
}
