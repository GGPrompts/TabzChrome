import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Dashboard build config - outputs to backend/public/dashboard/
export default defineConfig({
  root: 'dashboard',
  base: '/dashboard/', // Served from /dashboard/ path
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./dashboard', import.meta.url)),
      '@extension': fileURLToPath(new URL('./extension', import.meta.url)),
    },
  },
  build: {
    outDir: '../backend/public/dashboard',
    emptyOutDir: true,
  },
  server: {
    port: 5174, // Different from extension dev server
    proxy: {
      '/api': {
        target: 'http://localhost:8129',
        changeOrigin: true,
      },
    },
  },
})
