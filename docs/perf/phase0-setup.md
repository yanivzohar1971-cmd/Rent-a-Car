# Phase 0 - Setup Documentation

## ZIP Files Extracted
- **src_zip_1**: `_backups/Rent_a_Car_20251215_095730.zip` (Timestamp: 2025-12-15 09:57:30, Git HEAD: c3f58d95698325fc983572690da993a5b9c8ad3f)
- **src_zip_2**: `_backups/Rent_a_Car_20251215_095619.zip` (Timestamp: 2025-12-15 09:56:20, Git HEAD: c3f58d95698325fc983572690da993a5b9c8ad3f)

Both ZIPs are from the same git commit, extracted to `perf_mobile_100/src_zip_1/` and `perf_mobile_100/src_zip_2/`.

## Active Repo Identified
**Location**: `c:\Rent_a_Car\web\`

**Build Tool**: Vite 7.2.4
**Framework**: React 19.2.0 with TypeScript
**Router**: React Router DOM 7.9.6
**Firebase**: Firebase SDK 12.6.0

## Setup Commands

### Install Dependencies
```powershell
cd c:\Rent_a_Car\web
npm install
```

### Development Server
```powershell
cd c:\Rent_a_Car\web
npm run dev
```
Server typically runs on `http://localhost:5173`

### Production Build
```powershell
cd c:\Rent_a_Car\web
npm run build
```

### Preview Production Build
```powershell
cd c:\Rent_a_Car\web
npm run preview
```

## Environment Variables
No environment variables required for local development (Firebase config is likely in code or public config).

## Status
- ✅ Dependencies installed (node_modules exists)
- ✅ package-lock.json present
- ⏳ Ready for baseline Lighthouse measurements
