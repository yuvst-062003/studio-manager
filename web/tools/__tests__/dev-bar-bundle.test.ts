import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * §19.4 — "the component is tree-shaken out of production client bundles by an env
 * flag, so it is not merely hidden."
 *
 * "Hidden" and "absent" are different threat models and only one of them survives
 * someone opening devtools, so this builds the apps for real and reads what came out.
 *
 * **Both directions, deliberately.** A test that only asserted absence would pass just
 * as happily against a marker that was never in the source. The second case builds the
 * same app with the flag on and requires the marker to be there — that is what makes
 * the first case an assertion rather than a tautology.
 *
 * The markers are test ids, NOT the Hebrew copy: Decision A routes the copy through
 * @studio/i18n, and packages/i18n/he/common.ts ships in every bundle. The copy is inert
 * data; the code that can call /api/v1/dev/* is the thing that must be gone — and those
 * endpoints do not exist in production either (§19.2).
 *
 * **All three apps, and every dev marker — both widenings were holes.** This file
 * measured `apps/staff` alone and looked only for the BAR. Two things slipped through it:
 *
 *   1. Two apps were never measured at all. The switch lives in a shared package, so the
 *      bar was in fact absent from all three — but "in fact" is what a guard exists to
 *      replace. `apps/dashboard` mounts a tool `apps/staff` does not have.
 *   2. The bar is not the only dev affordance. `registerBillingDevTools` (dashboard) and
 *      `registerAttendanceDevTools` (staff) were called unconditionally at module load,
 *      so `RunJobTool` — which POSTs the real `/billing-runs` — and the offline/slow
 *      toggles shipped in every production bundle. Nothing rendered them, because the
 *      container had been tree-shaken away and `AbsentDevBar` returns null. That is
 *      precisely the "hidden, not absent" outcome §19.4 refuses: the container's absence
 *      was doing the work, and one mounted `<DevBar>` from any future lane would have
 *      turned dead code back into a live button.
 *
 * ~6 real production builds. Worth it — this is the only gate that reads what ships
 * rather than what the config says.
 */

/** Every dev affordance's test id. `dev-tool-` is a prefix on purpose: the container
 *  writes `` `dev-tool-${key}` `` and the staff toggles write `` `dev-tool-${mode}` ``,
 *  so the literal that survives minification is the constant half. */
const MARKERS = ['studio-dev-bar', 'dev-tool-', 'dev-run-job'] as const

const APPS = ['staff', 'parent', 'dashboard'] as const
type App = (typeof APPS)[number]

/** What each app must contain when the flag is ON. The bar and the container's own tool
 *  ids are shared; `dev-run-job` is the dashboard's alone, and requiring it there is what
 *  keeps the absence assertion above from being vacuous for that app specifically. */
const PRESENT_WHEN_ENABLED: Record<App, readonly string[]> = {
  staff: ['studio-dev-bar', 'dev-tool-'],
  parent: ['studio-dev-bar', 'dev-tool-'],
  dashboard: ['studio-dev-bar', 'dev-tool-', 'dev-run-job'],
}

const WEB = resolve(new URL('../..', import.meta.url).pathname)

function buildAndRead(app: App, env: Record<string, string>): string {
  const out = mkdtempSync(join(tmpdir(), `devbar-bundle-${app}-`))
  execFileSync('npx', ['vite', 'build', '--outDir', out, '--emptyOutDir'], {
    cwd: join(WEB, 'apps', app),
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

/** Six builds, run once. Each assertion below reads a string rather than re-building —
 *  a `it.each` that built per case would spend six minutes proving the same six things. */
const built = new Map<string, string>()

describe('the dev bar and production bundles', () => {
  beforeAll(() => {
    for (const app of APPS) {
      built.set(`${app}:off`, buildAndRead(app, {}))
      built.set(`${app}:on`, buildAndRead(app, { VITE_DEV_TOOLS: 'true' }))
    }
  }, 900_000)

  // `.includes()` into a boolean rather than `toContain`, because a failing `toContain`
  // prints the ENTIRE minified bundle as its diff — several megabytes of noise in which
  // the one fact that matters (which marker, which app) is invisible.
  describe.each(APPS)('%s', (app) => {
    it.each(MARKERS)('production build contains no %s', (marker) => {
      const found = built.get(`${app}:off`)!.includes(marker)
      expect(found, `${marker} is in the ${app} production bundle`).toBe(false)
    })

    it.each(PRESENT_WHEN_ENABLED[app])(
      'contains %s when VITE_DEV_TOOLS=true — without this the case above proves nothing',
      (marker) => {
        const found = built.get(`${app}:on`)!.includes(marker)
        expect(found, `${marker} is missing from the ${app} dev-tools bundle`).toBe(true)
      },
    )
  })
})
