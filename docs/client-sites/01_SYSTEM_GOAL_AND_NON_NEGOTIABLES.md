# System Goal and Non-Negotiables

## Goal
Serve a fully branded dealer website under the **client's existing domain** from our own platform, using our own rendering, our own hosting, and the dealer's scoped vehicle data and media from the central system.

## The exact model
This is **not**:
- a separate project per client
- a separate database per client
- a mirrored copy of the old site
- a secondary “microsite” competing with the main marketplace

This **is**:
- one shared web engine
- one shared backend authority
- one shared media system
- one tenant-specific presentation layer per client domain
- one SEO-safe migration layer for legacy URLs

## Non-negotiables
1. **The client domain stays unchanged.**
2. **The site is hosted and rendered by us.**
3. **Vehicle data and images come from our central system only.**
4. **No duplicate DB per client.**
5. **No duplicate image storage per client.**
6. **Legacy URL equity must be preserved.**
7. **Cross-tenant leakage is forbidden.**
8. **Main marketplace SEO must not be damaged.**

## Platform-level outcome
For 100+ customers, we should be able to provision a site by configuration, not by forking code.

## Success criteria
- Existing domain can be pointed to our hosting.
- Tenant config selects branding/content/data scope.
- Legacy URLs are either preserved or 301-mapped semantically.
- Vehicle detail pages resolve from central inventory.
- Leads are tracked and routed to the right tenant.
- Sitemaps, canonical tags, robots, and redirects are tenant-safe.
