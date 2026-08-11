# Open Questions and Risks

## Open questions
1. Where should tenant domain metadata live in your current data model?
2. Is `yardsite` already intended as the isolated client-site hosting target, or only as a simplified runtime target?
3. Is there already any seller/yard-specific public route family in the web code that can be reused?
4. Is there already an SEO/domain resolver in functions that can be extended instead of adding a new one?
5. Do you want exact legacy URLs preserved when technically possible, or a cleaner modern route + 301 policy for most pages?

## Risks

### 1. Duplicate content risk
If the same vehicle is indexable on both the main marketplace and tenant domain without a clear strategy, SEO can split.

### 2. Broken vehicle mapping risk
Legacy `carcode` values may not map cleanly to current inventory.

### 3. Over-coupling risk
If tenant logic is shoved directly into marketplace code paths without a boundary, long-term maintenance will hurt.

### 4. Operational risk
Without a registry/import UI, each new client will become a manual engineering task.

### 5. Partial migration risk
If only homepage/listing are migrated and old detail URLs are ignored, traffic loss is likely.
