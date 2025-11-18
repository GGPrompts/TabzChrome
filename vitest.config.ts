import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    // Use jsdom environment for React testing
    environment: 'jsdom',

    // Setup files to run before each test file
    setupFiles: ['./tests/setup.ts'],

    // Test file patterns
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx'
    ],

    // Global test timeout (10 seconds)
    testTimeout: 10000,

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: [
        'src/hooks/**/*.ts',
        'src/hooks/**/*.tsx',
        'src/stores/**/*.ts',
        'src/stores/**/*.tsx',
        'src/utils/**/*.ts',
        'src/utils/**/*.tsx',
      ],
      exclude: [
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/node_modules/**',
        '**/dist/**',
      ],
      // 70%+ thresholds for hooks
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70,
      },
    },

    // Enable globals like describe, it, expect
    globals: true,
  },
})
