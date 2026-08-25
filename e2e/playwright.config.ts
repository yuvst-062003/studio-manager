import { defineConfig, devices } from '@playwright/test'

/**
 * SPEC §13's E2E layer: "Playwright — the five flows below", all of which must pass before
 * release.
 *
 * ── These specs do not pass yet, and that is the point ────────────────────────────────
 * They are written in the contract commit, ahead of every implementation, so each wave's
 * exit gate is a file that already exists rather than one written under deadline at the end
 * of the wave. A gate authored after the code it judges tends to describe what the code
 * does. The wave that fills each flow in is named at the top of its spec.
 *
 * ── One prerequisite this session could not land ──────────────────────────────────────
 * `@playwright/test` is **not installed**. `web/package.json` carries `playwright` — the
 * driver library the installability check uses — which is a different package from the test
 * runner these files import. Adding the devDependency and a `test:e2e` script means editing
 * `web/package.json` and regenerating `web/package-lock.json`, and this branch is the
 * contract author: a concurrent session owns `web/apps/**`, and a regenerated lockfile is
 * the one file guaranteed to conflict. So the dependency is named here instead of taken:
 *
 *     npm --prefix web i -D @playwright/test
 *     npx --prefix web playwright install chromium
 *     # then in web/package.json's scripts:
 *     #   "test:e2e": "playwright test -c ../e2e/playwright.config.ts"
 *
 * Until that lands these files are specifications rather than a runnable suite. They live
 * at the repository root rather than under `web/`, so they are outside `tsc --noEmit`'s and
 * `eslint .`'s scope and cannot redden a gate that is green today.
 *
 * ── Two settings that are decisions, not defaults ─────────────────────────────────────
 * `locale`/`timezoneId` are pinned. G3 stores UTC and renders `Asia/Jerusalem` *regardless
 * of locale*, and a suite that inherited the runner's zone would pass in Israel and fail in
 * CI — or worse, pass in CI while the rendering rule is broken. `he-IL` is pinned for the
 * same reason: the product is RTL first, and an LTR-by-default suite tests the fallback.
 *
 * Retries are zero. Flows 2 and 3 are about sync and asynchronous callbacks, which are
 * exactly the flows a retry would paper over — a retried offline-sync test that passes on
 * the second attempt has demonstrated the bug, not the fix.
 */

const env = process.env

export default defineConfig({
  testDir: '.',
  //: Generous, because flow 3 waits on a simulated IPN and §5.10 builds the UI for a delay
  //: rather than for instant confirmation.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  //: See the module docstring. A flake here is a finding.
  retries: 0,
  fullyParallel: false,
  reporter: env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: env.E2E_BASE_URL ?? 'http://localhost:5173',
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      //: §6.1 and §6.5 — the parent app is a phone product and flow 1 is walked on one.
      //: A registration funnel that only works at 1440px is a funnel that leaks.
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
    },
  ],
})
