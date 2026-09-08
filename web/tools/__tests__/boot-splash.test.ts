// A cold start must show ONE waiting screen, not three.
//
// The owner reinstalled the app and still saw white before the navy. The manifest was
// already fixed, so the OS splash was navy — what was left is this page's own ground
// (`html { background: var(--ground) }`, cream on the outward surface), painted the moment
// the CSS parses and before any JavaScript exists. Nothing in the app could remove it,
// because the app was not running yet.
//
// So each `index.html` paints the loading screen itself, inline. This test holds the three
// facts that make that work: it is there, it is the same colour the app's own splash uses,
// and something removes it at the right moment.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = join(__dirname, '..', '..')

const GROUND: Record<string, string> = {
  parent: '#001849',
  staff: '#14306b',
  dashboard: '#101828',
}

describe.each(Object.keys(GROUND))('%s — the first pixel is the loading screen', (app) => {
  const html = readFileSync(join(ROOT, 'apps', app, 'index.html'), 'utf8')
  const main = readFileSync(join(ROOT, 'apps', app, 'src', 'main.tsx'), 'utf8')

  it('paints the splash in the document, before any bundle', () => {
    expect(html).toContain('id="boot-splash"')
    // Inline styles, not a class: a class needs the stylesheet, and the stylesheet is one
    // of the things being waited for.
    const el = /<div id="boot-splash" style="([^"]+)"/.exec(html)
    expect(el, 'boot-splash must carry inline styles').not.toBeNull()
    expect(el![1]).toContain('position:fixed')
  })

  it('uses the same ground as the app’s own splash and its manifest', () => {
    // Three copies of one colour — here, `first-run/splash.css`, and the manifest. The
    // whole point is that a person cannot tell where one ends and the next begins, so a
    // drift of even one shade puts a visible seam back into the launch.
    expect(html).toContain(GROUND[app]!)
  })

  it('is removed once React has painted, and not before', () => {
    expect(main).toContain("getElementById('boot-splash')")
    expect(main).toContain('remove()')
    // Two frames. One `requestAnimationFrame` fires BEFORE the paint that renders the tree,
    // which would reopen the gap this closes — one frame wide, and on a slow phone visible.
    expect(main.match(/requestAnimationFrame/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
  })
})
