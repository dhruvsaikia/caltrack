import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so tests don't load the PWA plugin.
export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
  },
})
