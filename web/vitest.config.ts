import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        extends: true,
        // `scripts/` is where node build scripts live and where their dependencies
        // resolve. `tools/` does not exist yet; without the second glob this project
        // matched zero files and the parity spec was never discovered.
        test: {
          name: 'tools',
          include: ['tools/**/*.test.ts', 'scripts/**/*.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'packages',
          include: ['packages/*/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'apps',
          include: ['apps/*/src/**/*.test.{ts,tsx}'],
          environment: 'jsdom',
          setupFiles: ['./vitest.setup.ts'],
        },
      },
    ],
  },
})
