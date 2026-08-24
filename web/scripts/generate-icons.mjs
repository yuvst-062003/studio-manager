#!/usr/bin/env node
/**
 * Rasterise the brand mark into every icon size the three apps need.
 *
 * Re-run after replacing web/packages/ui/src/brand/mark.svg with the real logo
 * (§15 item 7, blocks M1):  node scripts/generate-icons.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const MARK = resolve(ROOT, 'web/packages/ui/src/brand/mark.svg')
const APPS = ['staff', 'parent', 'dashboard']

/** Chromium installability needs 192 and 512; the rest are polish. */
const STANDARD = [64, 128, 192, 256, 384, 512]
/** iOS reads apple-touch-icon; 180 is current, the others cover older hardware. */
const APPLE = [120, 152, 167, 180]
/** Maskable icons need safe-area padding or Android crops the mark. */
const MASKABLE = [192, 512]
const MASKABLE_PAD = 0.2
const GROUND = '#f7f5f1' // --ground, light. Kept in step with packages/ui/src/tokens.css.

for (const app of APPS) {
  const out = resolve(ROOT, `web/apps/${app}/public/icons`)
  await mkdir(out, { recursive: true })

  for (const size of STANDARD) {
    await sharp(MARK).resize(size, size).png().toFile(`${out}/icon-${size}.png`)
  }

  for (const size of MASKABLE) {
    const inner = Math.round(size * (1 - MASKABLE_PAD * 2))
    const pad = Math.round((size - inner) / 2)
    await sharp({
      create: { width: size, height: size, channels: 4, background: GROUND },
    })
      .composite([
        { input: await sharp(MARK).resize(inner, inner).png().toBuffer(), top: pad, left: pad },
      ])
      .png()
      .toFile(`${out}/maskable-${size}.png`)
  }

  for (const size of APPLE) {
    // iOS does not respect transparency on the home screen — flatten to the ground.
    await sharp(MARK)
      .resize(size, size)
      .flatten({ background: GROUND })
      .png()
      .toFile(`${out}/apple-touch-icon-${size}.png`)
  }

  await sharp(MARK)
    .resize(180, 180)
    .flatten({ background: GROUND })
    .png()
    .toFile(resolve(ROOT, `web/apps/${app}/public/apple-touch-icon.png`))

  await writeFile(
    `${out}/README.md`,
    '# Generated\n\nDo not edit by hand. Run `node scripts/generate-icons.mjs`\n' +
      'after replacing `web/packages/ui/src/brand/mark.svg` (§15 item 7).\n',
  )
  console.log(`icons → web/apps/${app}/public/icons`)
}
