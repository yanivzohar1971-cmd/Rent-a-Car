# Fix: False WARN in PUBLIC Car Projection State

## Summary
Fixed false warning when MASTER car is not published but PUBLIC document is missing. This is now correctly treated as expected behavior (OK status) instead of a warning.

## Changes Made
**File:** `functions/src/admin/adminDebug.ts`

### Logic Update
1. **Added `masterStateKnown` flag** to track whether MASTER state was successfully read
2. **Explicit check for `effectivePublished === false`**: When MASTER publish state is known and `effectivePublished === false`, missing PUBLIC doc is treated as EXPECTED
3. **Severity downgrade logic**:
   - **OK** when: `masterStateKnown && effectivePublished === false`
   - **WARN** when: `masterStateKnown && effectivePublished === true` (real projection failure)
   - **WARN** when: `masterStateKnown === false` (unknown state, conservative approach)

### Response Structure Updates
- Added `expectedAbsence: boolean` flag to details when PUBLIC is missing
- `nextAction` is preserved only when `effectivePublished === true` (indicating a real issue)
- Response shape remains backward compatible

## Behavior Changes

### Before
- All missing PUBLIC docs → **WARN** ✗
- No distinction between "expected absence" and "projection failure"

### After
- Missing PUBLIC when MASTER not published → **OK** ✓
- Missing PUBLIC when MASTER is published → **WARN** ✗ (unchanged)
- Missing PUBLIC when MASTER state unknown → **WARN** ✗ (conservative)

## Acceptance Criteria ✅
- [x] Archived/hidden/unpublished cars → OK (not WARN)
- [x] Published cars missing PUBLIC doc → WARN (unchanged)
- [x] No behavior change outside Admin Debug
- [x] Backward compatible response structure
- [x] Minimal diff with clear logic

## Deploy Command
```bash
firebase deploy --only functions
```
