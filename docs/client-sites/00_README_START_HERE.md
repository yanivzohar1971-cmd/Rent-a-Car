# SRK Client-Site Migration Kickoff Package

This package is the practical starting point for migrating a legacy dealer site (pilot: **srk-car.com**) into the Rent a Car platform while keeping the client's existing domain, preserving SEO, and serving the site from our own system.

## What this package includes

1. **01_SYSTEM_GOAL_AND_NON_NEGOTIABLES.md**
   - Defines the exact business/technical target.
2. **02_TENANT_SITE_PACKAGE_SPEC.md**
   - Defines what every client site gets.
3. **03_SRK_LEGACY_URL_MIGRATION_BLUEPRINT.md**
   - Legacy URL families, preservation strategy, redirect rules.
4. **04_IMPLEMENTATION_PHASES.md**
   - Build order from Phase 0 to launch.
5. **05_DATA_AND_OWNERSHIP_RULES.md**
   - What data is canonical and who writes what.
6. **06_SEO_AND_ROUTING_RULES.md**
   - Canonical, redirects, sitemap, robots, URL retention.
7. **07_BUILD_BACKLOG_FIRST_SPRINT.md**
   - First concrete engineering backlog.
8. **08_CURSOR_PROMPT_KICKOFF.md**
   - Ready-to-paste Cursor/Codex kickoff prompt.
9. **09_SRK_URL_INVENTORY_SEED.csv**
   - Seed list of SRK legacy URLs discovered externally.
10. **10_OPEN_QUESTIONS_AND_RISKS.md**
   - Risks, assumptions, and what to verify while coding.

## Important note

The URL inventory included here is a **strong seed**, not a full crawl dump. It is good enough to start building the migration layer immediately, but before production cutover you should still run a full crawler/sitemap export and diff against server logs.
