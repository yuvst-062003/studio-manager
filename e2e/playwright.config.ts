import path from 'node:path'

import { defineConfig, devices } from '@playwright/test'

import { API_ORIGIN, ORIGINS } from './origins'

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
 * ── The prerequisite, landed in W5's contract commit ──────────────────────────────────
 * `@playwright/test` used to be absent — `web/package.json` carried `playwright`, the
 * driver library the installability check uses, which is a different package from the test
 * runner these files import. Taking it meant regenerating `web/package-lock.json`, the one
 * file guaranteed to conflict with a live lane, so the contract author named the commands
 * here instead of running them. W5's contract commit is sequential work on `main` with no
 * worktrees open, which is the window that was being waited for. It is now installed and
 * pinned to `1.62.1`, matching the driver exactly — a runner and driver that disagree fail
 * in ways that read as browser bugs.
 *
 * What is still owed is HB-w3-e2e-harness: a seed-and-authenticate fixture over the §19.4
 * dev routes, and a rewrite of the spec bodies against the testid vocabulary the apps
 * actually expose. All fifteen tests are `test.fixme`-gated until then.
 *
 * ── `NODE_PATH`, and why the install alone was not enough ─────────────────────────────
 * Installing the runner did not make the suite loadable, and the reason is structural
 * rather than a missing flag. These files live at the repository root — deliberately, see
 * below — while `node_modules` lives under `web/`. Node resolves a bare specifier by
 * walking up from the *importing file*, so `/e2e/playwright.config.ts` looks in
 * `/node_modules` and stops; it never looks sideways into `/web/node_modules`. Every one of
 * the five specs imports `@playwright/test` too, so this was never one file's problem.
 *
 * `web/package.json`'s `test:e2e` therefore sets `NODE_PATH=node_modules` (relative to
 * `web/`, which is where an npm script runs). The alternatives were each worse: a root
 * `package.json` gives the repo a second npm root that `npm ci --prefix web` does not
 * install, so every lane worktree would silently lack the runner; moving `e2e/` under
 * `web/` pulls five specs into `tsc --noEmit` and `eslint .` and gives up the property the
 * next paragraph is about. `NODE_PATH` is POSIX-only, which matches this repo — `.venv/bin`
 * prefixes and `dev-db.sh` already assume a POSIX shell.
 *
 * This belongs in HB-w3-e2e-harness's ledger as a fourth finding: the holdback names three
 * false assumptions, and "the suite can resolve its own runner" was a fourth.
 *
 * ── Three projects, because there are three apps ──────────────────────────────────────
 * `staff`, `parent` and `dashboard` are three separate Vite servers on three ports. The
 * single `baseURL` this config used to carry could reach exactly one of them, which is
 * HB-w3-e2e-harness's second finding and is closed here.
 *
 * Two things a reader should know before trusting the arrangement:
 *
 * 1. **A project's `baseURL` does not make the cross-app flows work.** Four of the five
 *    flows visit two apps inside a single test. Two origins in one test is not something
 *    projects can express; the second one has to be absolute. `./origins.ts` holds them so
 *    the rewrite has one place to read them from.
 *
 * 2. **Each spec now runs in exactly one project**, which is the decision the contract
 *    commit deferred to this session. It was right to defer: the flows are named for
 *    journeys rather than apps, so no filename filter splits them, and the thing that does
 *    split them is only visible with the bodies in front of you — **whose surface the
 *    flow's actor is on**.
 *
 *    | Spec | Project | Why |
 *    |---|---|---|
 *    | `01-registration-to-active` | `parent` | It starts with a stranger on the public landing, and §6.1 walks that funnel on a phone. |
 *    | `02-offline-attendance`     | `staff`  | The actor is a coach on the mat. |
 *    | `03-upay-happy-path`        | `parent` | A parent choosing months and pressing pay. |
 *    | `04-forged-ipn`             | `dashboard` | The assertions are the manager's ledger, the IPN log and the alert centre. |
 *    | `05-schedule-change`        | `dashboard` | A manager changing a group's rules. |
 *
 *    Fifteen runs instead of forty-five, and each test runs under the device profile the
 *    person in it is actually holding. The other apps a flow touches are reached by
 *    absolute `ORIGINS`, which is what finding 1 above is about — so narrowing costs no
 *    coverage, it only stops walking each journey three times to learn the same thing.
 *
 * The mobile profile is on `parent` alone: §6.1 walks flow 1 on a phone and §6.5 ships the
 * parent app as a phone product. The staff app is *also* used on a phone, on the mat — that
 * it runs desktop-only here is a gap someone should close deliberately, not evidence that
 * anyone decided coaches use laptops.
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

//: `webServer.cwd` defaults to this config's own directory, and every command below is
//: repo-root-relative. There is no package.json at the repo root, so Playwright loads this
//: file as CJS and `__dirname` resolves.
const REPO_ROOT = path.join(__dirname, '..')

//: One entry per Vite app. `--prefix web` because the workspaces root is `web/`, and the
//: package names come from each app's package.json.
//:
//: `--strictPort` is the load-bearing flag. Vite's default on a taken port is to pick the
//: next free one and carry on — during this commit's first run it announced staff on 5176
//: while the readiness probe waited on 5173, and the whole block died on a 120s timeout
//: that named nothing. Worse than the timeout is the case where the probe *succeeds*: a
//: suite pointed at 5173 while THIS server drifted to 5176 is a suite testing whatever
//: happened to be on 5173 already. Fail on the collision instead.
const devServer = (workspace: string, url: string) => ({
  command: `npm --prefix web run dev --workspace ${workspace} -- --strictPort`,
  url,
  cwd: REPO_ROOT,
  //: Locally a developer usually already has these running; in CI a reused server would
  //: mean testing whatever was left over from the previous job.
  reuseExistingServer: !env.CI,
  timeout: 120_000,
  stdout: 'pipe' as const,
  stderr: 'pipe' as const,
})

export default defineConfig({
  testDir: '.',
  //: One reset for the whole run, not one per test. `fixtures/global-setup.ts` carries the
  //: measurement behind that: /dev/demo/reset works once and then 500s, because `audit_log`
  //: is never wiped, `person` is, and the actor foreign key between them is RESTRICT. Each
  //: test isolates itself by building its own entities instead.
  globalSetup: './fixtures/global-setup.ts',
  //: Generous, because flow 3 waits on a simulated IPN and §5.10 builds the UI for a delay
  //: rather than for instant confirmation.
  timeout: 60_000,
  expect: { timeout: 10_000 },
  //: See the module docstring. A flake here is a finding.
  retries: 0,
  fullyParallel: false,
  reporter: env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      //: Managers + coaches. Desktop until someone decides otherwise — see the docstring.
      name: 'staff',
      testMatch: /02-offline-attendance\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: ORIGINS.staff },
    },
    {
      //: §6.1 and §6.5 — the parent app is a phone product and flow 1 is walked on one.
      //: A registration funnel that only works at 1440px is a funnel that leaks.
      name: 'parent',
      testMatch: /0(1-registration-to-active|3-upay-happy-path)\.spec\.ts$/,
      use: { ...devices['Pixel 7'], baseURL: ORIGINS.parent },
    },
    {
      //: Manager web. The one surface that genuinely is a desktop product. It also carries
      //: the two fixture specs, which address the API rather than any one app.
      name: 'dashboard',
      testMatch: /(0(4-forged-ipn|5-schedule-change)|fixtures\/(fixtures|scenario))\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'], baseURL: ORIGINS.dashboard },
    },
  ],
  //: The API first, then the three apps. Playwright starts them concurrently and waits for
  //: every `url` to answer, so the ordering here is documentation rather than sequencing —
  //: each Vite server proxies `/api` to the backend and will simply 502 until it is up.
  webServer: [
    {
      //: Not `uvicorn` directly: `webServer` cannot start PostgreSQL, and `/api/v1/health`
      //: reads `alembic_version`, so a missing database turns into a two-minute readiness
      //: timeout that names neither cause nor fix. The script checks first and says so.
      //: It self-locates its repo root, so `cwd` here is belt-and-braces.
      command: './scripts/e2e-backend.sh',
      url: `${API_ORIGIN}/api/v1/health`,
      cwd: REPO_ROOT,
      reuseExistingServer: !env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    devServer('@studio/staff', ORIGINS.staff),
    devServer('@studio/parent', ORIGINS.parent),
    devServer('@studio/dashboard', ORIGINS.dashboard),
  ],
})
