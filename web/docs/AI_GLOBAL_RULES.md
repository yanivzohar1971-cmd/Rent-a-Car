# AI Global Rules for CarExpert Web

> **This document defines mandatory rules for all AI/Cursor work on this repository.**
> All AI agents working on this codebase MUST respect these rules at all times.

---

## 1. Safety Belt – Non-destructive Changes Only

AI agents working on this repository must follow these safety rules:

### MUST NOT:
- Delete working implementations or business logic
- Replace full screens/components with placeholders or stubs
- Remove or rename core infrastructure files
- Break existing functionality while adding new features
- Overwrite entire files when only small changes are needed

### MUST:
- Make only incremental changes and extensions
- Preserve all existing exports, types, and public APIs
- Use `merge: true` when updating Firestore documents
- Test that existing features still work after changes
- When uncertain, prefer adding new code over modifying critical paths

### If Something Breaks:
- Immediately stop and report the issue
- Do NOT attempt large-scale fixes without human approval
- Provide a minimal rollback plan if requested

---

## 2. Global Role Separation

The CarExpert product has distinct user roles, each with separate flows and UI:

| Role | Description |
|------|-------------|
| YARD | Car dealership / lot owner |
| BUYER | Car buyer looking for vehicles |
| PRIVATE SELLER | Individual selling their car |
| ADMIN | System administrator |
| AGENT | Sales agent / broker |

### Rules:

- **Each role has its own screens, view-models, navigation, and business logic**
- AI must NEVER merge role UIs into a single "god component"
- AI must NEVER mix role responsibilities or cross-contaminate flows
- When adding features, respect existing role boundaries
- Shared components (like Footer, Header) must remain role-agnostic
- Role-specific logic belongs in role-specific directories/files

### Example Structure:
```
src/pages/
  YardFleetPage.tsx       # YARD role only
  BuyerSearchPage.tsx     # BUYER role only
  PrivateSellerPage.tsx   # PRIVATE SELLER role only
  AdminDashboard.tsx      # ADMIN role only
```

---

## 3. Build Info Center – Must Always Exist

The project includes a Build Info Center that displays version information to users. This is **mandatory diagnostics infrastructure** and must never be removed.

### Required Components:

| File | Purpose |
|------|---------|
| `web/src/config/buildInfo.ts` | Exports BUILD_VERSION, BUILD_ENV, BUILD_LABEL |
| `web/src/config/buildChangelog.ts` | BUILD_CHANGELOG array with version history |
| `web/src/components/Footer.tsx` | Shows version label + "Build Info" button |
| `web/src/components/BuildInfoDialog.tsx` | Modal dialog showing current + historical builds |

### Rules:

#### AI MUST NOT:
- Remove the Build Info button from the footer
- Delete buildInfo.ts, buildChangelog.ts, or BuildInfoDialog.tsx
- Replace these components with placeholders
- Remove BUILD_VERSION, BUILD_ENV, or BUILD_LABEL exports
- Break the changelog structure or dialog functionality

#### AI MAY:
- Improve UX/UI of the Build Info dialog
- Extend the build metadata model (add new fields)
- Integrate CI/CD-generated changelog data
- Add new helper functions for build info
- Improve styling while maintaining functionality

### Build Changelog Structure:
```typescript
interface BuildEntry {
  version: string;     // e.g. "2025.12.09-01"
  label: string;       // e.g. "v2025.12.09-01"
  env: string;         // "production" | "staging" | "local"
  topic: string;       // Short title (Hebrew or English)
  timestamp: string;   // When this build was created
  summary?: string;    // One-line summary
  changes?: BuildChangeItem[];  // Detailed changes
}
```

The FIRST entry in BUILD_CHANGELOG must always be the CURRENT build.

---

### BUILD INFO & CHANGELOG (MANDATORY)

- Every time you perform a **production Hosting deploy** for the Web app (Firebase Hosting: `carexpert-94faa.web.app`), you MUST:

  1. **Update `src/config/buildChangelog.ts`:**
     - Add a new entry at the **top** of `BUILD_CHANGELOG` (newest first).
     - The entry must include:
       - `version` and `label` (using the current `BUILD_VERSION`, `BUILD_LABEL`, `BUILD_ENV`).
       - A clear `topic` summarizing the main feature/fix (one short sentence).
       - `timestamp` in the format `YYYY-MM-DD HH:mm:ss`.
       - `summary` – 1–3 sentences describing what changed in this deploy.
       - `changes` – a list of items with:
         - `type` (for example: `"feature"`, `"bugfix"`, `"infra"`),
         - `title` (short),
         - `description` (1–3 sentences, user-focused, no internal tool names like "Cursor" or "agent").

  2. **Build the Web app** (for example: `npm run build`) and ensure it passes without errors.

  3. **Deploy Hosting only** (for example: `firebase deploy --only hosting`), unless the task explicitly requires deploying other targets as well.

- Never overwrite or delete previous changelog entries – always prepend a new one at the top of `BUILD_CHANGELOG`.

- The **Build Info modal in the footer** is a user-facing contract:
  - It must always describe the **current deployed behavior**.
  - If you make any change that affects user behaviour (UI, flows, rules, performance, or visible infra changes), you MUST reflect it in `buildChangelog.ts` before deploying.

- When writing `summary` and each `changes[*].description`:
  - Do NOT mention implementation tools or internal processes (for example: "Cursor", "prompt", "agent").
  - Use clear product language (for example: "fixed Yard Excel import processing", "improved Yard Fleet image loading", "added Build Info entry for version X").

---

## 4. Build Log Behavior (No Database Yet)

The build history is currently stored **in-code only** – there is no database or Firestore collection for builds.

### Current Storage:
- Build history lives in `web/src/config/buildChangelog.ts` as a TypeScript array (`BUILD_CHANGELOG`).
- The Build Info Center UI reads directly from this array.
- New builds are PREPENDED to the array (newest first, current build at index 0).

### AI Agent Responsibilities:
- Treat your `Topic:` and high-level summary as potential Build Log entries.
- Write summaries as if they will appear in the Build Info Center UI.
- **For production Hosting deploys, you MUST update `buildChangelog.ts` before deploying** (see Section 3 above).
- For non-deploy tasks, produce a `BuildEntry` template only if explicitly requested.

### Future Database Migration:
- When/if we migrate to Firestore, the same `BuildEntry` structure will be used.
- AI agents should NOT introduce database tables for builds unless explicitly requested.

---

## 5. Response Format & Timing (for AI Agents)

Every AI answer must follow this format:

### At the Start:
```
Topic: <short description of the task>
```

### At the End:
```
Topic: <same topic>
Start: YYYY-MM-DD HH:mm:ss (your local time)
End:   YYYY-MM-DD HH:mm:ss (your local time)
Duration: HH:mm:ss
```

### Example:
```
Topic: Fix navigation bug in YardFleetPage

[... answer content ...]

Topic: Fix navigation bug in YardFleetPage
Start: 2025-12-09 14:30:00 (Asia/Jerusalem)
End:   2025-12-09 14:45:30 (Asia/Jerusalem)
Duration: 00:15:30
```

This timing format helps track AI productivity and task duration.

### Timestamp Integrity (Non-Negotiable)
- Start/End MUST reflect the real current local time (Asia/Jerusalem). Never fabricate dates/times.
- If the environment cannot access a trustworthy clock, output:
  Start: UNKNOWN
  End: UNKNOWN
  Duration: UNKNOWN
  …instead of guessing.
- Start must be <= End. Duration must match End-Start.

### Deadlock Guard (No Infinite Planning)
- If the agent is stuck in "planning moves" / repeated cycles for more than ~90 seconds without producing file diffs or commands:
  1) STOP planning immediately
  2) Output a STATE REPORT with:
     - which file(s) were opened
     - what is blocking progress
     - the single smallest next step required
  3) Do NOT keep looping.

---

## 6. Change Type Emoji Legend

This project uses a consistent emoji-based legend to categorize changes in deployment notes, changelogs, and AI-generated summaries. Each change entry should start with one or more emojis from the list below, followed by a short label and a concise description.

### Legend

| Emoji | Category | Description |
|-------|----------|-------------|
| 🐞 | Bugfix | Fixes to incorrect behavior, crashes, or defects. |
| ✨ | UX/UI | User experience and interface improvements (layout, styling, interactions). |
| 🧠 | Logic | Business logic changes, algorithms, or rules adjustments. |
| 🧱 | Infra / Refactor | Infrastructure, refactoring, performance, build, or tooling changes. |
| 🖼️ | Images / Media | Gallery, images, media handling, or visual assets logic. |
| 🌐 | Share / SEO / Links | Public links, sharing flows (Facebook/WhatsApp/etc.), SEO/meta updates. |
| ✅ | Verification / QA | Manual test scenarios, validation steps, and quality checks. |

### Example Usage

When documenting changes in summaries, changelogs, or deployment notes, use the following format:

- 🐞 Bugfix – Fixed image count desynchronization between `publicCars` and the Yard Fleet table.
- 🖼️✨ Images / UX – CarImageGallery now opens a full-screen zoom overlay when clicking the main image, with ESC/backdrop close support.
- 🌐✅ Share / Verification – Facebook share was verified to use `getEffectivePublicCarId` with Firestore fallback, ensuring public links always resolve to the correct car.
- 🧠 Logic – Enhanced `normalizeCarImages()` to support multiple legacy image field formats for backward compatibility.
- 🧱 Infra / Refactor – Centralized image normalization logic into reusable `carImageHelper.ts` utility.

**Notes:**
- Multiple emojis can be combined when a change spans multiple categories (e.g., 🖼️✨ for image-related UI improvements).
- Emojis are not optional; they are part of the visual language for change categorization.
- All content remains in professional English, left-to-right.

---

## 7. General Best Practices

### Code Style:
- Follow existing project conventions (TypeScript, React patterns)
- Maintain RTL support for Hebrew UI
- Use existing CSS variables and component patterns
- Keep imports organized and consistent

### Documentation:
- Add JSDoc comments for new functions
- Update relevant README sections if adding new features
- Keep inline comments concise but helpful

### Testing:
- Verify build passes after changes: `npm run build`
- Test that existing features still work
- Check console for errors

---

## Enforcement

All AI/Cursor work on this repository is expected to follow these rules.

When reviewing AI-generated code:
1. Check that no working code was deleted
2. Verify role separation is maintained
3. Confirm Build Info Center is intact
4. Ensure response format was followed
5. Verify change summaries use the emoji legend (Section 6)

---

*Last updated: 2025-12-09*

