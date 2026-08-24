import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dist = resolve(process.cwd(), 'apps/staff/dist')
const read = (f: string) => readFileSync(resolve(dist, f), 'utf-8')

// The precache list lives in a workbox-${hash}.js chunk, not sw.js itself.
const precacheText = () => {
  if (!existsSync(dist)) {
    throw new Error('apps/staff/dist is missing — run `npm run build` first. '
      + 'These specs assert built output on purpose: a config assertion passes '
      + 'while the font silently fails to precache (§6.1).')
  }
  const files = readdirSync(dist).filter((f) => f.endsWith('.js'))
  return files.map((f) => read(f)).join('\n')
}

describe('staff service worker build output (run after `npm run build`)', () => {
  it('emits a service worker at the app root so its scope covers the whole app', () => {
    expect(existsSync(resolve(dist, 'sw.js'))).toBe(true)
  })

  it('precaches all four Rubik subsets — §6.1 offline priming assumes the font is there', () => {
    // Rubik is a VARIABLE font: one file per subset carrying the whole 300-900 axis, so
    // this is what "weights 300/400/500/600/700 are available offline" reduces to. The
    // axis itself is asserted in packages/ui/src/fonts.test.ts.
    //
    // `rubik-latin-wght`, not `rubik-latin`: the bare prefix also matches
    // rubik-latin-ext, so the original assertion passed even if the latin subset itself
    // had been dropped.
    const text = precacheText()
    expect(text).toMatch(/rubik-hebrew-wght[^"']*\.woff2/)
    expect(text).toMatch(/rubik-latin-wght[^"']*\.woff2/)
    expect(text).toMatch(/rubik-latin-ext-wght[^"']*\.woff2/)
    expect(text).toMatch(/rubik-cyrillic-wght[^"']*\.woff2/)
  })

  it('precaches the app shell', () => {
    expect(precacheText()).toMatch(/index\.html/)
  })

  it('emits a webmanifest linked from the built HTML', () => {
    expect(read('index.html')).toMatch(/manifest\.webmanifest/)
    expect(existsSync(resolve(dist, 'manifest.webmanifest'))).toBe(true)
  })

  it('precaches the icons the install dialog needs, so it works offline too', () => {
    expect(precacheText()).toMatch(/icon-512[^"']*\.png/)
  })
})
