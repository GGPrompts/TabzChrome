import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { fileURLToPath, URL } from 'node:url'
import manifest from './extension/manifest.json' with { type: 'json' }

// https://vitejs.dev/config/
export default defineConfig({
  root: 'extension',
  base: './', // Use relative paths for Chrome extension compatibility
  plugins: [
    react(),
    crx({ manifest }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./extension', import.meta.url)),
    },
  },
  build: {
    outDir: '../dist-extension',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        dashboard: fileURLToPath(new URL('./extension/dashboard/index.html', import.meta.url)),
        '3d-focus': fileURLToPath(new URL('./extension/3d/3d-focus.html', import.meta.url)),
        newtab: fileURLToPath(new URL('./extension/newtab/index.html', import.meta.url)),
        bookmarks: fileURLToPath(new URL('./extension/bookmarks/index.html', import.meta.url)),
      },
    },
  },
})
