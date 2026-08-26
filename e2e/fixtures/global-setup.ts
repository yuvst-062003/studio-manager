/**
 * One reset, at the top of the run.
 *
 * ── Why not one reset per test ────────────────────────────────────────────────────────
 * Because `POST /dev/demo/reset` works exactly once, and then 500s for ever. Three
 * decisions meet to produce that, each defensible alone:
 *
 *   * `audit_log` is in `NEVER_WIPED` (`app/services/demo/service.py`) — it is append-only
 *     by grant, and §19.4 audit-logs every persona switch to it, so it is evidence rather
 *     than scratch data.
 *   * `person` IS wiped — the `personas` layer deletes and recreates the nine rows.
 *   * `fk_audit_log_actor_person_id_person` is ON DELETE **RESTRICT**.
 *
 * So the first audit row carrying an `actor_person_id` pins the person it names, and the
 * next wipe raises `RestrictViolation`. Measured, not reasoned about: with an empty
 * `audit_log`, reset answers 200, and answers 200 again with no actions in between; one
 * `POST /locations` (which writes no audit row) leaves it at 200; one `PATCH /studio`
 * (which writes one, with an actor) takes it to 500.
 *
 * That makes §19.7's "restores the fixture set from a versioned seed" unreachable after a
 * single meaningful use, and it is not this lane's to fix — the repair is a migration
 * setting those two actor foreign keys to ON DELETE SET NULL, and `main` owns
 * `alembic/versions/**`. Tracked as a holdback.
 *
 * ── What this file does about it, and what it refuses to do quietly ───────────────────
 * It clears `audit_log` before resetting, and says so on stdout every time. Clearing it
 * destroys exactly the evidence `NEVER_WIPED` exists to protect, so the one thing this must
 * not be is silent: a developer reading the run output should see the workaround and the
 * holdback that will remove it, not discover months later that their audit trail has been
 * truncated by a test run.
 *
 * Because there is only one reset, no test may assume an empty studio. Each builds its own
 * group, its own student and its own charges, and asserts only on ids it created —
 * isolation by construction rather than by teardown, which is the sturdier arrangement in
 * any case.
 */

import { execFileSync } from 'node:child_process'
import path from 'node:path'

import { request } from '@playwright/test'

import { API_ORIGIN } from '../origins'
import { resetDemoStudio } from './api'

const REPO_ROOT = path.join(__dirname, '..', '..')

/**
 * Which database the API is configured for, asked of the settings object rather than
 * hardcoded — the same resolution `scripts/e2e-backend.sh` uses, and for the same reason.
 * A name written down twice is a name that goes stale once: an earlier version of this file
 * truncated `studio_manager` while the stack had moved to `studio_manager_e2e`, so the
 * clearing silently did nothing and the reset went on failing for its original reason.
 */
function databaseName(): string {
  return execFileSync(
    '.venv/bin/python',
    [
      '-c',
      'from urllib.parse import urlparse\n' +
        'from app.core.config import settings\n' +
        'print(urlparse(settings.MIGRATION_DATABASE_URL.replace("+psycopg", "")).path.lstrip("/"))',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  ).trim()
}

/** The `audit_log` truncation, and the reason it is a named function rather than a line. */
function clearAuditLog(): void {
  console.log(
    '\n[e2e] Clearing audit_log before the demo reset.\n' +
      '[e2e]   WHY: audit_log is NEVER_WIPED, person is wiped, and the actor foreign key\n' +
      '[e2e]        between them is ON DELETE RESTRICT — so one audited action makes every\n' +
      '[e2e]        later /dev/demo/reset raise RestrictViolation.\n' +
      '[e2e]   COST: this destroys §19.4 persona-switch evidence in the local database.\n' +
      '[e2e]   FIX:  a migration setting audit_log.actor_person_id and .actor_identity_id\n' +
      '[e2e]        to ON DELETE SET NULL. Until then this line stays, and stays loud.\n',
  )
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'docker-compose.yml',
      'exec',
      '-T',
      'db',
      'psql',
      '-U',
      'studio_migrator',
      '-d',
      databaseName(),
      '-c',
      'truncate audit_log',
    ],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  )
}

export default async function globalSetup(): Promise<void> {
  clearAuditLog()

  const api = await request.newContext({ baseURL: API_ORIGIN })
  try {
    await resetDemoStudio(api)
    console.log('[e2e] demo studio reset — studio, nine personas, two health templates.\n')
  } finally {
    await api.dispose()
  }
}
