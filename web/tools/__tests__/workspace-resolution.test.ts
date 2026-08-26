// Seam 1's other half: a lane worktree must resolve ITS OWN `@studio/*` packages.
//
// `git worktree add` copies no untracked file, so a lane's `web/node_modules` is a symlink
// to main's — that is deliberate, and for third-party packages it is right. But npm
// workspaces put the workspace links INSIDE node_modules, so `@studio/i18n` in a lane
// resolves through main's `node_modules/@studio/i18n` to **main's** `web/packages/i18n`.
// A lane editing `packages/i18n/he/events.ts` then watches its own tests read main's copy
// and stay red, which reads as a bug in the lane's code rather than in its resolution.
// Both W4 lanes hit it; W4's EVENTS lane found it after thirty-nine tests refused to go
// green against keys that were provably in the file.
//
// The alias below fixes it and is a NO-OP on main: it points at the same files the
// workspace symlink already reaches. So this test is the only place the guarantee is
// visible here, which is exactly why it is written down.
//
// The map is DERIVED from each package's own `exports`, not hand-listed. A hand-listed
// copy is the same shape of bug as the one `app/core/dev_account.py::configured_dev_token`
// exists to prevent: two statements of one rule, drifting the first time somebody adds an
// export.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { workspaceAliases } from '../workspace-aliases'

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** Every alias every config must carry, read from the packages themselves. */
const ALIASES = workspaceAliases()

function findsOf(alias: unknown): string[] {
  if (Array.isArray(alias)) return alias.map((entry) => String(entry.find))
  return Object.keys(alias as Record<string, unknown>)
}

describe('workspace aliases', () => {
  it('covers every package and every subpath export it declares', () => {
    const finds = ALIASES.map((entry) => entry.find)
    expect(finds).toContain('@studio/ui')
    expect(finds).toContain('@studio/core')
    expect(finds).toContain('@studio/api-client')
    expect(finds).toContain('@studio/i18n')
    // `@studio/ui` declares three subpath exports and every one of them is imported
    // somewhere in the apps. A bare-specifier-only map would silently miss them.
    expect(finds).toContain('@studio/ui/theme')
    expect(finds).toContain('@studio/ui/manifest')
    expect(finds).toContain('@studio/ui/dev-bar')
  })

  it('points every alias at a file that exists in THIS checkout', () => {
    for (const { find, replacement } of ALIASES) {
      expect(existsSync(replacement), `${find} -> ${replacement}`).toBe(true)
      expect(replacement.startsWith(WEB_ROOT), `${find} escapes this checkout`).toBe(true)
    }
  })

  it('orders a subpath before the bare specifier it starts with', () => {
    // @rollup/plugin-alias matches a string `find` against `importee === find ||
    // importee.startsWith(find + '/')`, in array order. So `@studio/ui` listed first would
    // swallow `@studio/ui/dev-bar` and rewrite it to `…/src/index.ts/dev-bar`. Longest
    // first is not cosmetic; it is the difference between working and a resolution error.
    const finds = ALIASES.map((entry) => entry.find)
    expect(finds.indexOf('@studio/ui/dev-bar')).toBeLessThan(finds.indexOf('@studio/ui'))
  })

  it('is applied by the vitest config every lane check runs through', async () => {
    const config = (await import('../../vitest.config')).default as {
      resolve?: { alias?: unknown }
    }
    expect(config.resolve?.alias, 'vitest.config.ts declares no @studio alias').toBeDefined()
    expect(findsOf(config.resolve!.alias)).toEqual(ALIASES.map((entry) => entry.find))
  })

  it('is applied by tsconfig too, because tsc resolves through node_modules as well', () => {
    // The third resolver. vite serves the app, vitest runs the tests, and `tsc --noEmit`
    // typechecks — and all three follow `node_modules/@studio/*` unless told otherwise. A
    // worktree with the vite alias but no tsconfig `paths` gets green tests and a red
    // typecheck against MAIN's types, which is a confusing half-fix: the error names a
    // property that provably exists in the file the editor is showing.
    //
    // `paths` cannot call a function, so it is the one hand-written copy of this map. That
    // is what this assertion is for.
    const tsconfig = JSON.parse(
      readFileSync(resolve(WEB_ROOT, 'tsconfig.json'), 'utf8'),
    ) as { compilerOptions?: { paths?: Record<string, string[]> } }
    const paths = tsconfig.compilerOptions?.paths
    expect(paths, 'tsconfig.json declares no @studio paths').toBeDefined()

    for (const { find, replacement } of ALIASES) {
      const target = paths![find]
      expect(target, `tsconfig paths is missing ${find}`).toBeDefined()
      expect(resolve(WEB_ROOT, target![0]!)).toBe(replacement)
    }
    expect(Object.keys(paths!).sort()).toEqual(ALIASES.map((e) => e.find).sort())
  })

  it.each(['dashboard', 'parent', 'staff'])(
    'is applied by the %s app so the dev server and the build agree with the tests',
    async (app) => {
      // A test-only alias would give a lane green tests and a dev server still serving
      // main's components — the worse half of the bug, because it looks fixed.
      const source = readFileSync(resolve(WEB_ROOT, 'apps', app, 'vite.config.ts'), 'utf8')
      expect(source).toContain('workspaceAliases')
    },
  )
})
