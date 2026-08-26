import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { workspaceAliases } from './tools/workspace-aliases'

export default defineConfig({
  plugins: [react()],
  // A lane worktree's node_modules is a symlink to main's, and npm workspaces put the
  // `@studio/*` links inside it -- so without this, a lane's tests import MAIN's packages
  // and a lane editing packages/i18n watches its own keys fail to appear. A no-op on main,
  // where it names the files the symlink already reaches. See tools/workspace-aliases.ts.
  //
  // The import above is extensionless on purpose, and Vite warns about it: its native
  // config loader wants `./tools/workspace-aliases.ts`. That spelling makes `tsc --noEmit`
  // fail with TS5097, because tsconfig.base.json sets `allowImportingTsExtensions: false`
  // deliberately -- and flipping a considered compiler setting to silence a forward-compat
  // warning is the wrong trade. Revisit when Vite makes the native loader the default.
  resolve: { alias: workspaceAliases() },
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
