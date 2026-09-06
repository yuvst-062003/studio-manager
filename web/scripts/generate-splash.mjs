#!/usr/bin/env node
/**
 * Rasterise the iOS launch screens for the two installable phone apps.
 *
 *     node scripts/generate-splash.mjs
 *
 * Re-run after replacing `web/packages/ui/src/brand/mark.png` or changing a ground colour
 * in `packages/ui/src/theme.ts`. The device table and the matching <link> tags live in
 * `web/tools/splash-screens.mjs` — see its header for why iOS needs these at all.
 *
 * **What is drawn: the app's own ground, and the mark.** Not a designed splash. The point
 * of a launch screen is that the moment before first paint looks like the moment after it,
 * so the ground colour is read from the same `GROUND_COLOR` table the app paints itself
 * with — `outward` for the parent app, `inward` for staff, exactly as their index.html
 * `data-surface` says.
 *
 * **The dashboard is excluded**, the same call as the viewport lock: it is the manager's
 * desktop tool and nobody launches it from an iPhone home screen.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { disc } from '../tools/brand-mark.mjs'
import { SPLASH_DIR, SPLASH_SCHEMES, SPLASH_SCREENS, splashFile } from '../tools/splash-screens.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** `GROUND_COLOR` from packages/ui/src/theme.ts, per app surface. */
const GROUND = {
  parent: { light: '#fcf9f8', dark: '#141519' },
  staff: { light: '#f7f5f1', dark: '#141311' },
}

/**
 * The mark's share of the narrow edge.
 *
 * A launch screen is looked at for a fraction of a second, so the mark is sized the way an
 * app icon is on a home screen rather than the way a logo is on a poster: present, centred,
 * and not filling the display. 32% of the short edge puts it at roughly the size of the
 * icon the finger just left.
 */
const MARK_SHARE = 0.32

/**
 * And never larger than the artwork itself. `mark.png` is 512x512, so an iPad Pro canvas
 * asking for 32% of 2048 would have sharp upscale it to 655 -- which adds blur and bytes
 * and no detail. Capping here is what keeps a launch screen at tens of kilobytes rather
 * than hundreds, and it is the right call on its own terms.
 */
const MARK_MAX = 512

for (const [app, ground] of Object.entries(GROUND)) {
  const out = resolve(ROOT, `web/apps/${app}/public/${SPLASH_DIR}`)
  await mkdir(out, { recursive: true })

  for (const scheme of SPLASH_SCHEMES) {
    for (const screen of SPLASH_SCREENS) {
      const width = screen.width * screen.ratio
      const height = screen.height * screen.ratio
      const mark = Math.min(Math.round(Math.min(width, height) * MARK_SHARE), MARK_MAX)
      const canvas = sharp({
        create: { width, height, channels: 4, background: ground[scheme] },
      })
      await writeFile(
        `${out}/${splashFile(screen, scheme)}`,
        await canvas
          .composite([{ input: await disc(mark), gravity: 'centre' }])
          // A flat ground and one mark: 128 colours is more than the artwork uses, and
          // `effort: 10` is affordable in a generator that runs by hand.
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
