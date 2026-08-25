import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * §19.4 — "the component is tree-shaken out of production client bundles by an env
 * flag, so it is not merely hidden."
 *
 * "Hidden" and "absent" are different threat models and only one of them survives
 * someone opening devtools, so this builds the app for real and reads what came out.
 *
 * **Both directions, deliberately.** A test that only asserted absence would pass just
 * as happily against a marker that was never in the source. The second case builds the
 * same app with the flag on and requires the marker to be there — that is what makes
 * the first case an assertion rather than a tautology.
 *
 * The marker is the dev bar's own test id, NOT its Hebrew copy: Decision A routes the
 * copy through @studio/i18n, and packages/i18n/he/common.ts ships in every bundle. The
 * copy is inert data; the code that can call /api/v1/dev/* is the thing that must be
 * gone — and those endpoints do not exist in production either (§19.2).
 *
 * ~20s: two real production builds. Worth it — this is the only gate that reads what
 * ships rather than what the config says.
 */
const MARKER = 'studio-dev-bar'
const APP = resolve(new URL('../..', import.meta.url).pathname, 'apps/staff')

function buildAndRead(env: Record<string, string>): string {
  const out = mkdtempSync(join(tmpdir(), 'devbar-bundle-'))
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
    cwd: APP,
    // Vitest sets NODE_ENV=test on its own process before this file ever runs. Vite's
    // resolveConfig only defaults NODE_ENV to "production" when it is UNSET
    // (isNodeEnvSet check) — a `...process.env` spread here would carry "test" straight
    // into the child `vite build`, making `isProduction = NODE_ENV === 'production'`
    // false and `import.meta.env.DEV` true, so even the flag-off build would wrongly
    // include the dev bar. Verified directly: `NODE_ENV=test vite build` reproduces the
    // leak outside vitest too. A real `npm run build` from a shell or CI has no such
    // inherited NODE_ENV, so this pin reproduces that, not works around it.
    env: { ...process.env, NODE_ENV: 'production', ...env },
    stdio: 'pipe',
  })
  const assets = join(out, 'assets')
  return readdirSync(assets)
    .map((file) => readFileSync(join(assets, file), 'utf-8'))
    .join('\n')
}

describe('the dev bar and production bundles', () => {
  it('is absent from a production build', { timeout: 180_000 }, () => {
    expect(buildAndRead({})).not.toContain(MARKER)
  })

  it('is present when VITE_DEV_TOOLS=true — without this the case above proves nothing', {
    timeout: 180_000,
  }, () => {
    expect(buildAndRead({ VITE_DEV_TOOLS: 'true' })).toContain(MARKER)
  })
})
