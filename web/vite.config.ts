import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

// https://vite.dev/config/
export default defineConfig({
  base: '/', // Use relative base to ensure chunks load from same origin (apex or www)
  plugins: [
    react(),
    visualizer({
      filename: './docs/perf/bundle-stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap', // treemap, sunburst, network
    }),
  ],
  build: {
    sourcemap: true, // Enable sourcemaps for production debugging and Lighthouse
    cssCodeSplit: true, // Enable CSS code splitting per route (reduces render-blocking CSS)
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Split Firebase into separate vendor chunk to enable better code-splitting
          if (id.includes('node_modules/firebase') || id.includes('@firebase')) {
            return 'firebase-vendor';
          }
          
          // Split React core libraries (React, ReactDOM, React Router) together
          // to avoid circular dependencies
          if (
            id.includes('node_modules/react') || 
            id.includes('node_modules/react-dom') ||
            id.includes('node_modules/react-router') ||
            id.includes('node_modules/scheduler')
          ) {
            return 'react-vendor';
          }
          
          // Keep other node_modules in default vendor chunk
          // This prevents the index chunk from becoming too large
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
  define: {
    // Ensure production environment is set correctly
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
  resolve: {
    conditions: ['production', 'default'],
  },
})
