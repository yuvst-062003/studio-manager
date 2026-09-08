// The loading screen's colour is written in two places that cannot import each other, and
// they were allowed to drift.
//
// `splash.css` paints the screen in the browser. Each app's `manifest.config.ts` sets
// `background_color`, which is what iOS and Android paint BEFORE any JavaScript runs. When
// those differed, opening the installed app showed two loading screens in two colours back
// to back — the owner saw a white one and then ours, and asked why there were two.
//
// `SPLASH_GROUND` is now the one value. CSS cannot import TypeScript, so this test reads the
// stylesheet and compares. It is the only thing holding them together.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPLASH_GROUND } from '../theme'

const css = readFileSync(join(__dirname, 'splash.css'), 'utf8')

describe('the splash ground is one colour, not two', () => {
  it.each(Object.entries(SPLASH_GROUND))(
    'splash.css paints %s with the constant the manifest uses',
    (tone, colour) => {
      const rule = new RegExp(
        "\\.studio-splash\\[data-tone='" +
          tone +
          "'\\][^{]*\\{[^}]*background:\\s*(#[0-9a-fA-F]{6})",
      ).exec(css)
      expect(rule, `no ground rule for ${tone} in splash.css`).not.toBeNull()
      expect(rule![1]!.toLowerCase()).toBe(colour.toLowerCase())
    },
  )

  it('every tone in the stylesheet is one the constant knows about', () => {
    // A fourth app added to the CSS and not to the constant would have no manifest colour
    // to match, which is the same two-screen defect arriving from the other direction.
    const tones = [...css.matchAll(/\.studio-splash\[data-tone='([a-z]+)'\]/g)].map((m) => m[1])
    for (const tone of new Set(tones)) {
      expect(Object.keys(SPLASH_GROUND)).toContain(tone)
    }
  })
})
