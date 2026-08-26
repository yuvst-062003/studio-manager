import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

/**
 * G4 — "no user-facing string is ever inlined in a component" — was scoped to
 * `apps/* /src/** /*.tsx`, because packages/ui primitives take their text as props. The
 * dev bar is the exception to that convention: it is a feature, not a primitive, and it
 * carries its own copy.
 *
 * Decision A of the M0.4 plan: rather than exempt it, the rule is EXTENDED to cover it.
 * Its persona labels are the product's own role names, so inline Hebrew there would be
 * a second set that drifts from `people`'s the day M1 lands — and an ESLint hole in
 * developer-only code is a precedent a later lane can cite.
 *
 * This spec is what stops the extension being silently dropped by a future config edit.
 */
const lint = async (code: string, filePath: string) => {
  const eslint = new ESLint({ cwd: new URL('../..', import.meta.url).pathname })
  const results = await eslint.lintText(code, { filePath })
  return results.flatMap((r) => r.messages.map((m) => m.message)).join('\n')
}

const INLINE_HEBREW = 'export const A = () => <div>שלום עולם</div>'
const VIA_T = `import { t } from '@studio/i18n'
export const A = () => <div>{t('he', 'common.dev.title')}</div>`

describe('G4 covers the dev bar', () => {
  it('rejects an inlined string in the dev-bar directory', async () => {
    const out = await lint(INLINE_HEBREW, 'packages/ui/src/dev-bar/Fixture.tsx')
    expect(out).toMatch(/no user-facing string is inlined/)
  })

  it('accepts the same component when the string comes from t()', async () => {
    const out = await lint(VIA_T, 'packages/ui/src/dev-bar/Fixture.tsx')
    expect(out).not.toMatch(/no user-facing string is inlined/)
  })

  it('still leaves the primitives alone — they take their text as props', async () => {
    const out = await lint(INLINE_HEBREW, 'packages/ui/src/primitives/Fixture.tsx')
    expect(out).not.toMatch(/no user-facing string is inlined/)
  })

  it('still covers the apps', async () => {
    const out = await lint(INLINE_HEBREW, 'apps/staff/src/Fixture.tsx')
    expect(out).toMatch(/no user-facing string is inlined/)
  })

  // Round 1 fix: a dev-bar `.test.tsx` fixture string is test scaffolding, never
  // shipped and never translated, so G4 has nothing to protect there. Pinned here so
  // the `ignores: ['**/*.test.tsx']` line in eslint.config.js's dev-bar block cannot
  // be dropped silently — without this case, removing it surfaces only as a confusing
  // lint failure in someone else's unrelated change.
  it('does not flag a .test.tsx fixture in the dev-bar directory', async () => {
    const out = await lint(INLINE_HEBREW, 'packages/ui/src/dev-bar/DevBar.test.tsx')
    expect(out).not.toMatch(/no user-facing string is inlined/)
  })
})
