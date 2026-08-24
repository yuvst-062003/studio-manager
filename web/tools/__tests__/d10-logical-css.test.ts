import { describe, expect, it } from 'vitest'
import { ESLint } from 'eslint'

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
