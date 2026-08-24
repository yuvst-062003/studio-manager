import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'
import stylelint from 'stylelint'

const lintText = async (code: string) => {
  const eslint = new ESLint({ cwd: new URL('../..', import.meta.url).pathname })
  const results = await eslint.lintText(code, { filePath: 'apps/staff/src/Fixture.tsx' })
  return results.flatMap((r) => r.messages.map((m) => m.message)).join('\n')
}

describe('D10 — physical CSS properties are banned before the first component', () => {
  it('rejects marginLeft in a style object', async () => {
    const out = await lintText(`export const A = () => <div style={{ marginLeft: 8 }} />`)
    expect(out).toMatch(/marginInlineStart/)
  })

  it('rejects a bare left offset', async () => {
    const out = await lintText(`export const A = () => <div style={{ left: 0 }} />`)
    expect(out).toMatch(/insetInlineStart/)
  })

  it('accepts the logical equivalent', async () => {
    const out = await lintText(
      `export const A = () => <div style={{ marginInlineStart: 8 }} />`,
    )
    expect(out).not.toMatch(/marginInlineStart is banned/)
  })
})

const CONFIG = new URL('../../stylelint.config.js', import.meta.url).pathname

const lintCss = async (code: string) => {
  const { results } = await stylelint.lint({ code, configFile: CONFIG, codeFilename: 'probe.css' })
  return results.flatMap((r) => r.warnings.map((w) => w.text)).join('\n')
}

/**
 * The CSS half of D10. ESLint's rule is `no-restricted-syntax` over JS object properties,
 * so a physical property written in tokens.css or any other stylesheet is completely
 * invisible to it. Verified in M0.3: `margin-left` planted in tokens.css left
 * `lane-check.sh core` green at exit 0.
 *
 * Each case asserts the message names the CORRECT replacement, not merely that something
 * was reported. "don't use margin-left" without "use margin-inline-start" is a rule that
 * gets worked around rather than fixed, which is why the ESLint half names one too.
 */
describe('D10 in stylesheets — stylelint is the only thing that reads these', () => {
  it.each([
    ['margin-left: 4px', /use margin-inline-start\b/],
    ['margin-right: 4px', /use margin-inline-end\b/],
    ['padding-left: 4px', /use padding-inline-start\b/],
    ['padding-right: 4px', /use padding-inline-end\b/],
    ['border-left: 1px solid red', /use border-inline-start\b/],
    ['border-right: 1px solid red', /use border-inline-end\b/],
    ['left: 0', /use inset-inline-start\b/],
    ['right: 0', /use inset-inline-end\b/],
    ['border-top-left-radius: 4px', /use border-start-start-radius\b/],
    ['border-bottom-right-radius: 4px', /use border-end-end-radius\b/],
  ])('rejects %s and names its replacement', async (decl, expected) => {
    expect(await lintCss(`.probe { ${decl}; }`)).toMatch(expected)
  })

  it.each([
    // The four holes M0.3 found by probing the config rather than reading it.
    ['inset: 0 auto 0 0', /inset is banned — use inset-block and inset-inline/],
    ['border-left-width: 1px', /border-left-width is banned — use border-inline-start-width/],
    ['border-right-color: red', /border-right-color is banned — use border-inline-end-color/],
    ['clear: left', /clear is banned — use flex or grid/],
  ])('rejects %s — the gap M0.3 closed', async (decl, expected) => {
    expect(await lintCss(`.probe { ${decl}; }`)).toMatch(expected)
  })

  it.each([
    ['float: left', /float: left has no logical form/],
    ['float: right', /float: right has no logical form/],
    ['text-align: left', /text-align: left is banned/],
    ['text-align: right', /text-align: right is banned/],
  ])('rejects %s', async (decl, expected) => {
    expect(await lintCss(`.probe { ${decl}; }`)).toMatch(expected)
  })

  it.each([
    'margin-inline-start: 4px',
    'padding-inline-end: 4px',
    'border-inline-start: 1px solid red',
    'border-inline-end-width: 1px',
    'inset-inline-start: 0',
    'inset-block: 0',
    'text-align: start',
    'margin-block: 4px',
    'border-start-start-radius: 4px',
  ])('accepts the logical equivalent %s', async (decl) => {
    expect(await lintCss(`.probe { ${decl}; }`)).toBe('')
  })

  it('lints the real stylesheets clean', async () => {
    // The gate has to be satisfiable by the CSS we actually ship, not only by fixtures.
    const { errored } = await stylelint.lint({
      files: [new URL('../../packages/ui/src/*.css', import.meta.url).pathname],
      configFile: CONFIG,
    })
    expect(errored).toBe(false)
  })
})
