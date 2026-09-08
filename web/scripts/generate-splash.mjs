#!/usr/bin/env node
/**
 * Rasterise the iOS launch screens for the two installable phone apps.
 *
 *     node scripts/generate-splash.mjs
 *
 * Re-run after changing `SPLASH_GROUND` in `packages/ui/src/theme.ts`. The device table and the matching <link> tags live in
 * `web/tools/splash-screens.mjs` — see its header for why iOS needs these at all.
 *
 * **What is drawn: the LOADING screen's ground, flat.** The point of a launch screen is
 * that the moment before first paint looks like the moment after it — and what comes after
 * it is not the app, it is the loading screen (`packages/ui/src/first-run/splash.css` and
 * the inline one in each index.html). These used to be drawn in the app's own `GROUND_COLOR`
 * with the mark on it, which is why an installed app opened on a cream rectangle carrying a
 * logo and only then went navy: iOS was faithfully showing the launch image it was given.
 *
 * **No mark, and that is deliberate.** The loading screen puts the wordmark and the dots up
 * the instant the page paints; drawing a different mark here first would make the launch a
 * sequence of two pictures rather than one ground that gains content. A flat colour cannot
 * disagree with what follows it.
 *
 * **Both schemes get the same colour.** The loading screen is not theme-dependent — it is
 * the brand ground in either — so `-light` and `-dark` differ only in filename, which is
 * what the media queries in `tools/splash-screens.mjs` need to keep matching.
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

/** `SPLASH_GROUND` from packages/ui/src/theme.ts. Kept in step by
 *  `tools/__tests__/splash-ground.test.ts`, because a `.mjs` script cannot import the
 *  TypeScript constant and a second copy of a colour is how the first one drifted. */
const GROUND = {
  parent: { light: '#001849', dark: '#001849' },
  staff: { light: '#14306b', dark: '#14306b' },
}

for (const [app, ground] of Object.entries(GROUND)) {
  const out = resolve(ROOT, `web/apps/${app}/public/${SPLASH_DIR}`)
  await mkdir(out, { recursive: true })

  for (const scheme of SPLASH_SCHEMES) {
    for (const screen of SPLASH_SCREENS) {
      const width = screen.width * screen.ratio
      const height = screen.height * screen.ratio
      const canvas = sharp({
        create: { width, height, channels: 4, background: ground[scheme] },
      })
      await writeFile(
        `${out}/${splashFile(screen, scheme)}`,
        await canvas
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
