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

## 4. Build Log Behavior (No Database Yet)

The build history is currently stored **in-code only** – there is no database or Firestore collection for builds.

### Current Storage:
- Build history lives in `web/src/config/buildChangelog.ts` as a TypeScript array (`BUILD_CHANGELOG`).
- The Build Info Center UI reads directly from this array.
- New builds are PREPENDED to the array (newest first, current build at index 0).

### AI Agent Responsibilities:
- Treat your `Topic:` and high-level summary as potential Build Log entries.
- Write summaries as if they will appear in the Build Info Center UI.
- For deploy/release tasks, produce a `BuildEntry` template (but do NOT modify the file unless explicitly requested).

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

---

## 6. General Best Practices

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

---

*Last updated: 2025-12-09*

