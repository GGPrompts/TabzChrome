import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import manifest from './extension/manifest.json' with { type: 'json' }
import { buildSync } from 'esbuild'

const CONSOLE_MAIN_WORLD_ASSET = 'content/consoleMainWorld.js'

// CRXJS content-script loaders are asynchronous. Emit this hook as one IIFE so
// the registered MAIN-world script executes synchronously at document_start.
function bundleConsoleMainWorld() {
  let serveOutDir: string | null = null
  const bundle = () => buildSync({
    entryPoints: [fileURLToPath(new URL('./extension/content/consoleMainWorld.ts', import.meta.url))],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    write: false,
  }).outputFiles[0].text
  return {
    name: 'bundle-console-main-world',
    configResolved(config: { command: string; root: string; build: { outDir: string } }) {
      serveOutDir = config.command === 'serve' ? resolve(config.root, config.build.outDir) : null
    },
    buildStart() {
      const source = bundle()
      if (serveOutDir) {
        const target = resolve(serveOutDir, CONSOLE_MAIN_WORLD_ASSET)
        mkdirSync(dirname(target), { recursive: true })
        writeFileSync(target, source)
        return
      }
      this.emitFile({ type: 'asset', fileName: CONSOLE_MAIN_WORLD_ASSET, source })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  root: 'extension',
  base: './', // Use relative paths for Chrome extension compatibility
  plugins: [
    react(),
    crx({ manifest }),
    bundleConsoleMainWorld(),
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
