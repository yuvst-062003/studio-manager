import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Read from cwd rather than import.meta.url: the jsdom environment rewrites
// import.meta.url to a non-file scheme.
const raw = readFileSync(resolve(process.cwd(), 'packages/ui/src/tokens.css'), 'utf-8')
// Comments are prose and may legitimately name a retired token to explain why it
// is retired. The assertions are about declarations.
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')
const lightBlock = css.slice(css.indexOf(':root'), css.indexOf('[data-theme="dark"]'))
const darkBlock = css.slice(css.indexOf('[data-theme="dark"]'))

describe('D8 — retired greys never return to a light-mode text token', () => {
  it.each(['#a8a49a', '#8f8b82', '#7a766d'])('%s is absent from the light block', (hex) => {
    expect(lightBlock).not.toContain(hex)
  })

  it('#a8a49a and #8f8b82 remain valid in the dark block', () => {
    expect(darkBlock).toContain('#a8a49a')
    expect(darkBlock).toContain('#8f8b82')
  })

  it('#7a766d is retired outright — neither mode', () => {
    expect(css).not.toContain('#7a766d')
  })
})

describe('D1/D2 — semantic tokens are defined, not improvised', () => {
  it.each(['--debt', '--paid', '--pending', '--cancelled', '--danger', '--focus-ring'])(
    '%s exists',
    (token) => expect(css).toContain(token),
  )
})

describe('D7 — every belt bar carries a 1px ring in the current foreground colour', () => {
  it('defines --belt-ring in both modes', () => {
    expect(lightBlock).toContain('--belt-ring: #17150f')
    expect(darkBlock).toContain('--belt-ring: #fffefb')
  })
})
