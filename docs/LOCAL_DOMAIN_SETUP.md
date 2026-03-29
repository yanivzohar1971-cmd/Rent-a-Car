# Local Domain Setup

## Purpose
Using `*.local` hostnames in development makes local routing feel closer to production domain behavior. This is useful for:
- tenant/domain-aware frontend behavior
- future separation between app, API, and admin surfaces
- testing host-based logic before real DNS/proxy setup

## Recommended Local Hostnames
- `app.local` - main frontend app
- `srk.local` - active tenant test host
- `api.local` - future backend/API host
- `admin.local` - future admin surface host

## Vite Dev Note
Vite host allow-list settings are **dev-only**.  
This repo currently uses:
- `server.host = true` (bind externally on local machine network interfaces)
- `server.allowedHosts = ['.local']` (allow any `*.local` hostname)

This is required only for local Vite development and is not a production routing mechanism.

## Hosts File Example
Add entries like these to your OS hosts file:

```txt
127.0.0.1 app.local
127.0.0.1 srk.local
127.0.0.1 api.local
127.0.0.1 admin.local
```

## Local Dev vs Production
- **Local dev**: OS hosts file maps names to `127.0.0.1`, and Vite serves the frontend on the configured port.
- **Production**: DNS records map hostnames to real infrastructure, and hosting/proxy rules route each hostname to the correct service.

## Production Domain Architecture (Recommended)
- `www.<domain>` = marketing/public site
- `app.<domain>` = main application
- `api.<domain>` = backend/API
- `admin.<domain>` = optional admin app

How it works in practice:
- DNS points each hostname to the target platform/load balancer.
- Reverse proxy/hosting rules decide which service handles each hostname.
- Frontend SPA hosts must include rewrite/fallback rules so deep links return `index.html`.

## SPA Routing in Production
For frontend hosts (`www`, `app`, optionally `admin`), unknown frontend paths must be rewritten to `index.html` so client-side routes work:
- `/cars`
- `/cars/:id`
- `/account/...`

API hosts should **not** use SPA rewrites.

## Troubleshooting
- **Blocked host**: Ensure Vite `server.allowedHosts` includes your hostname pattern (currently `['.local']`).
- **Hosts file mismatch**: Verify hostname points to `127.0.0.1`.
- **App opens but assets fail**: Confirm same origin/port and that Vite is running on expected port.
- **Wrong port target**: Use the exact dev URL and port printed by Vite (for example `http://app.local:5173`).

## Next Step Checklist (Production)
- Connect/purchase production domain.
- Configure DNS records per hostname.
- Map hostnames in hosting/reverse proxy.
- Enable SSL certificates for all public hosts.
- Add SPA rewrites for frontend hosts.
- Route `api.<domain>` to backend service separately.
