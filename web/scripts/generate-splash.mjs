#!/usr/bin/env node
/**
 * Rasterise the iOS launch screens for the two installable phone apps.
 *
 *     node scripts/generate-splash.mjs
 *
 * Re-run after changing `GROUND` or `WORDMARK` below. The device table and the matching
 * <link> tags live in `web/tools/splash-screens.mjs` — see its header for why iOS needs
 * these at all.
 *
 * **What is drawn: the club's navy, and GLADIATOR CLUB in white.** Owner's request,
 * 2026-09-08, and it is the fix for a bug rather than a decoration. These images used to be
 * painted in the app's own `GROUND_COLOR` — `#fcf9f8` for the parent app, cream — with the
 * gi crest composited in the middle. So the owner tapped the icon and got a white screen
 * with the club mark on it, every launch, on both apps. That was never iOS falling back to
 * a default screen of its own: all thirty `apple-touch-startup-image` tags matched, and iOS
 * was faithfully showing the picture it had been handed. The picture was the bug.
 *
 * **No crest, and both apps carry the same words.** The crest is drawn for a light
 * background — near-black outer ring, black lettering — so on navy it needs a white disc
 * behind it to stay legible, which is a third shape on a screen that is looked at for a
 * fraction of a second. Text needs nothing behind it. The two apps are told apart by
 * `GROUND` alone, which is the distinction that was asked for.
 *
 * **Both schemes get the same navy.** A launch screen that is navy in light mode and
 * something else in dark mode is two designs; the brand ground is the brand ground either
 * way. `-light` and `-dark` therefore differ only in filename, which is what the media
 * queries in `tools/splash-screens.mjs` need in order to keep matching.
 *
 * **This is the whole launch screen.** There is no loading screen behind it and nothing is
 * layered on top: iOS holds this still image until the app's first paint, and then the app
 * appears. Eight commits on 2026-09-08 built a second screen in front of this one and were
 * reverted in b8b92a17 — the white was in *this* file the entire time. If the launch is
 * worth more work later, it starts by changing what is drawn here.
 *
 * **The dashboard is excluded**, the same call as the viewport lock: it is the manager's
 * desktop tool and nobody launches it from an iPhone home screen.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { SPLASH_DIR, SPLASH_SCHEMES, SPLASH_SCREENS, splashFile } from '../tools/splash-screens.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The club's navy, per app. Literals and not `GROUND_COLOR` from `packages/ui/src/theme.ts`:
 * that table records the colour each app *paints itself*, which is the cream and warm grey
 * this screen is deliberately no longer showing.
 *
 * `#001849` is the parent app's own navy — the same value its buttons and headings use, so
 * grep finds them together. `#14306b` is a step lighter, dark enough to carry white text at
 * AA and different enough that somebody with both apps installed can see which one is
 * starting before it has started.
 */
const GROUND = {
  parent: '#001849',
  staff: '#14306b',
}

/**
 * The two lines, and the treatment.
 *
 * Transcribed from the wordmark the sign-in screens wear: all caps, heavy, widely tracked,
 * with the second line smaller and held back. `sub`, `gap` and the tracking are expressed as
 * multiples of the main font size so one number scales the whole lockup.
 */
const WORDMARK = {
  line: 'GLADIATOR',
  sub: 'CLUB',
  /** The second line's size, as a share of the first. */
  subScale: 0.42,
  /** Space between the baselines' block, as a share of the first line's size. */
  gapScale: 0.35,
  /** Tracking, in em. Wide enough that nine capitals read as a mark rather than a word. */
  tracking: 0.18,
  subTracking: 0.32,
  /** The second line is quieter than the first without being a second colour. */
  subOpacity: 0.7,
}

/**
 * The family, and why it is not Rubik.
 *
 * The apps set `Rubik Variable`, but Rubik reaches the browser as the woff2 in
 * `@fontsource-variable/rubik`, and the fontconfig stack behind sharp cannot read woff2 —
 * naming Rubik here resolves to the default sans and only *looks* like the brand font was
 * used. So the stack is named honestly. The consequence to know about: the PNGs committed
 * under `public/splash/` are the artefact, rasterised by hand on macOS, and regenerating on
 * a machine with a different sans will redraw them slightly. That is visible in the diff as
 * thirty changed PNGs, which is the right place to notice it.
 */
const FONT = 'Helvetica Neue, Helvetica, Arial, sans-serif'

/**
 * The main line's size in CSS pixels, from the same clamp the sign-in wordmark uses:
 * `clamp(1.75rem, 9vw, 2.75rem)`. Kept in CSS pixels and multiplied by the device ratio
 * afterwards, so a 3x phone and a 2x iPad show the mark at the same physical size rather
 * than the same pixel count.
 *
 * @param {number} cssWidth the device's width in CSS pixels
 */
function fontSize(cssWidth) {
  return Math.min(Math.max(28, cssWidth * 0.09), 44)
}

/**
 * The lockup, transparent outside the glyphs, as wide as the canvas so `text-anchor=middle`
 * has the full width to centre against.
 *
 * No correction is applied for the tracking. Browsers add letter-spacing *after* every glyph
 * including the last, which pulls a centred string half a letter-space left of true centre —
 * librsvg, which is what renders this, does not, and half a letter-space is 9px at 3x. Both
 * behaviours were measured off the output rather than assumed, because they are opposites
 * and the wrong guess is a wordmark visibly off-axis on a screen with nothing else on it.
 *
 * `.trim()` is the vertical half of the same problem, and solves it without any font metrics
 * at all. The box this draws into has the first line's cap height as empty space at the top
 * and nothing under the second line's baseline, so centring the BOX lands the lettering
 * half a percent low. Trimming to the ink means `gravity: 'centre'` centres what is visible,
 * which is the only thing anybody is looking at.
 *
 * @param {number} width canvas width in device pixels
 * @param {number} size main line size in device pixels
 */
async function wordmark(width, size) {
  const sub = size * WORDMARK.subScale
  const gap = size * WORDMARK.gapScale
  const tracking = size * WORDMARK.tracking
  const subTracking = sub * WORDMARK.subTracking
  const height = Math.round(size + gap + sub)
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<text x="${width / 2}" y="${size}" text-anchor="middle"` +
    ` font-family="${FONT}" font-size="${size}" font-weight="800"` +
    ` letter-spacing="${tracking}" fill="#ffffff">${WORDMARK.line}</text>` +
    `<text x="${width / 2}" y="${height}" text-anchor="middle"` +
    ` font-family="${FONT}" font-size="${sub}" font-weight="600"` +
    ` letter-spacing="${subTracking}" fill="#ffffff"` +
    ` fill-opacity="${WORDMARK.subOpacity}">${WORDMARK.sub}</text>` +
    '</svg>'
  return sharp(Buffer.from(svg)).trim().png().toBuffer()
}

for (const [app, ground] of Object.entries(GROUND)) {
  const out = resolve(ROOT, `web/apps/${app}/public/${SPLASH_DIR}`)
  await mkdir(out, { recursive: true })

  for (const scheme of SPLASH_SCHEMES) {
    for (const screen of SPLASH_SCREENS) {
      const width = screen.width * screen.ratio
      const height = screen.height * screen.ratio
      const canvas = sharp({ create: { width, height, channels: 4, background: ground } })
      await writeFile(
        `${out}/${splashFile(screen, scheme)}`,
        await canvas
          .composite([
            {
              input: await wordmark(width, fontSize(screen.width) * screen.ratio),
              gravity: 'centre',
            },
          ])
          // A flat ground and white text: 128 colours is far more than the navy-to-white
          // ramp uses, and `effort: 10` is affordable in a generator that runs by hand.
          .png({ compressionLevel: 9, palette: true, colours: 128, effort: 10 })
          .toBuffer(),
      )
    }
  }

  await writeFile(
    `${out}/README.md`,
    '# Generated\n\nDo not edit by hand. Run `node scripts/generate-splash.mjs`.\n' +
      'The device list and the <link> tags come from `web/tools/splash-screens.mjs`.\n',
  )
  const count = SPLASH_SCHEMES.length * SPLASH_SCREENS.length
  console.log(`${count} launch screens → web/apps/${app}/public/${SPLASH_DIR}`)
}
