// The `@studio/*` → `packages/*` alias map, derived from the packages themselves.
//
// **Why this exists at all.** A lane worktree's `web/node_modules` is a symlink to main's,
// which is the right call for third-party packages — it gives every lane the same verified
// tree and makes a dependency change a stop-and-tell rather than a lane decision. But npm
// workspaces put the workspace links INSIDE `node_modules`, so in a worktree
// `@studio/i18n` resolves through main's `node_modules/@studio/i18n` to **main's**
// `web/packages/i18n`. A lane editing its own `packages/i18n/he/events.ts` then watches
// its own tests read main's copy and stay red — which reads as a bug in the lane's code
// rather than in its resolution, and cost W4's EVENTS lane a full task before the cause
// was visible.
//
// On main this alias is a NO-OP: it names the same files the workspace symlink already
// reaches. That is the point — one map, correct in both places, rather than a rule that
// holds only where nobody is working in parallel.
//
// **Derived, not listed.** Reading each package's own `exports` means adding an export to
// `@studio/ui` updates every config that imports this. A hand-written copy is the same
// shape of bug as the one `app/core/dev_account.py::configured_dev_token` exists to
// prevent: two statements of one rule, drifting the first time someone changes one.
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export type WorkspaceAlias = { find: string; replacement: string }

type PackageManifest = {
  name?: string
  main?: string
  exports?: Record<string, unknown> | string
}

/**
 * One entry per package export, longest specifier first.
 *
 * The ordering is load-bearing. `@rollup/plugin-alias` matches a string `find` against
 * `importee === find || importee.startsWith(find + '/')`, in array order — so `@studio/ui`
 * listed before `@studio/ui/dev-bar` would swallow the subpath and rewrite it to
 * `…/src/index.ts/dev-bar`. An object literal would work today, because JS preserves
 * string-key insertion order, but it would break silently the day someone sorted the keys.
 * An array says the ordering is deliberate.
 */
export function workspaceAliases(webRoot: string = DEFAULT_WEB_ROOT): WorkspaceAlias[] {
  const packagesDir = join(webRoot, 'packages')
  const found: WorkspaceAlias[] = []

  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const packageDir = join(packagesDir, entry.name)

    let manifest: PackageManifest
    try {
      manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'))
    } catch {
      // A directory under packages/ with no manifest is not a workspace package. Skipped
      // rather than thrown: a stray build output directory must not break every config.
      continue
    }
    if (!manifest.name) continue

    // `exports` when there is one, `main` otherwise. Both forms appear in this repo's
    // history and a package is free to carry either.
    const exportsMap: Record<string, unknown> =
      typeof manifest.exports === 'object' && manifest.exports !== null
        ? manifest.exports
        : { '.': manifest.exports ?? manifest.main }

    for (const [subpath, target] of Object.entries(exportsMap)) {
      if (typeof target !== 'string') continue
      const specifier =
        subpath === '.' ? manifest.name : `${manifest.name}/${subpath.replace(/^\.\//, '')}`
      found.push({ find: specifier, replacement: join(packageDir, target) })
    }
  }

  // Longest first, then alphabetical so the order is stable across filesystems that
  // enumerate directories differently — a config whose alias order depends on the machine
  // is a config that resolves differently on the machine nobody tested on.
  return found.sort((a, b) => b.find.length - a.find.length || a.find.localeCompare(b.find))
}
