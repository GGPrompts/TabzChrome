import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Test environment
    environment: 'node',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'tests/**',
        '**/*.config.js'
      ]
    },

    // Test file patterns
    include: ['tests/**/*.test.js', 'routes/__tests__/*.test.js', 'modules/__tests__/*.test.js'],

    // Global test timeout (10 seconds)
    testTimeout: 10000,

    // Bail on first test failure (optional)
    // bail: 1,

    // Reporter
    reporters: ['verbose'],

    // Globals (optional - allows using describe/it without imports)
    globals: true,
  },
})
