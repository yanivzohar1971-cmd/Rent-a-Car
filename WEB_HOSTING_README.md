# Firebase Hosting Setup for CarExperts Web Portal

This guide explains how to deploy the CarExperts web app to Firebase Hosting using the free subdomain `carexperts.web.app`.

## Prerequisites

1. **Node.js and npm** installed on your system
2. **Firebase CLI** installed globally
3. **Firebase account** with project access

## Installation Steps

### 1. Install Firebase CLI (if not already installed)

```powershell
npm install -g firebase-tools
```

### 2. Login to Firebase

```powershell
firebase login
```

This will open your browser for authentication. After logging in, return to the terminal.

### 3. Set Firebase Project

```powershell
firebase use carexperts
```

If the project doesn't exist yet, you may need to create it first in the [Firebase Console](https://console.firebase.google.com/).

### 4. Install Web Dependencies and Build

```powershell
cd web
npm i
npm run build
cd ..
```

This will:
- Install all required npm packages in `web/`
- Build the production-ready files to `web/dist/`

### 5. Deploy to Firebase Hosting

```powershell
firebase deploy --only hosting
```

## Deployment Result

After successful deployment, your web app will be available at:

**https://carexperts.web.app**

## Redeploying

To redeploy after making changes:

```powershell
cd web
npm run build
cd ..
firebase deploy --only hosting
```

Or use the build script directly:

```powershell
cd web && npm run build && cd .. && firebase deploy --only hosting
```

## Common Errors and Fixes

### Error: Permission Denied

**Problem:** `Error: HTTP Error: 403, Permission denied`

**Solution:**
- Ensure you're logged in: `firebase login`
- Verify you have the correct project: `firebase use carexperts`
- Check project permissions in Firebase Console

### Error: Project Not Found

**Problem:** `Error: Project 'carexperts' not found`

**Solution:**
- Create the project in [Firebase Console](https://console.firebase.google.com/)
- Or use a different project ID: `firebase use <project-id>`
- Update `.firebaserc` with the correct project ID

### Error: Build Folder Missing

**Problem:** `Error: Directory public does not exist`

**Solution:**
- Ensure `web/dist` exists: `cd web && npm run build`
- Check `firebase.json` has correct `public: "web/dist"` path
- Verify the build completed without errors

### Error: Firebase CLI Not Found

**Problem:** `'firebase' is not recognized as an internal or external command`

**Solution:**
- Install Firebase CLI: `npm install -g firebase-tools`
- Verify installation: `firebase --version`
- May need to restart terminal after installation

## Project Structure

```
Rent_a_Car/
├── web/                    # Vite React TypeScript app
│   ├── dist/              # Production build (generated)
│   ├── src/               # Source files
│   ├── package.json       # Web app dependencies
│   └── vite.config.ts     # Vite configuration
├── firebase.json          # Firebase configuration
└── .firebaserc            # Firebase project alias
```

## Development

To run the development server locally:

```powershell
cd web
npm run dev
```

Then open `http://localhost:5173` in your browser.

## Build Configuration

The web app is built using:
- **Vite** - Fast build tool
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Plain CSS** - Styling (no Tailwind)

Production build output: `web/dist/`

## Firebase Hosting Configuration

- **Public Directory:** `web/dist`
- **SPA Rewrites:** All routes → `/index.html`
- **Ignore Patterns:** `firebase.json`, hidden files, `node_modules/`

See `firebase.json` for full configuration.

