#!/usr/bin/env node
/**
 * Rasterise the brand mark into every icon size the three apps need.
 *
 * The mark is the club's own: a white judogi with a black belt on a teal disc
 * (`web/packages/ui/src/brand/mark.png`, 512×512, supplied 2026-08-25 — §15 item 7).
 * It replaced the M0 placeholder SVG. Re-run after replacing it:
 *
 *     node scripts/generate-icons.mjs
 *
 * **Three treatments, because the three purposes are masked differently.**
 *
 *   any       — shipped as drawn. These render unmasked (browser tab, install dialog,
 *               task switcher) and the disc-on-white IS the artwork.
 *   maskable  — Android crops to a circle, a squircle or a rounded square depending on
 *               the launcher, and it picks. The supplied mark has a ~3px white margin
 *               outside the disc, so a squircle mask would show white slivers in the
 *               corners. The disc is therefore re-composited onto its own teal, full
 *               bleed: every mask shape then cuts teal, which looks deliberate under all
 *               of them.
 *   apple     — iOS masks to a superellipse with a small radius, so the same white
 *               corners would show. Same treatment. iOS also ignores transparency, which
 *               a flat background removes the question of.
 *
 * No safe-area padding is added. Maskable's rule is that essential content sits inside
 * the middle 80% circle, and this mark already satisfies it — the gi's widest point is
 * ~191px from centre against a 205px safe radius. Padding it further would shrink the
 * mark for nothing.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { BRAND, MARK, disc } from '../tools/brand-mark.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APPS = ['staff', 'parent', 'dashboard']

/** Chromium installability needs 192 and 512; the rest are polish. */
const STANDARD = [64, 128, 192, 256, 384, 512]
/** iOS reads apple-touch-icon; 180 is current, the others cover older hardware. */
const APPLE = [120, 152, 167, 180]
/** Maskable icons need safe-area padding or Android crops the mark. */
const MASKABLE = [192, 512]

/**
 * The mark's disc laid on full-bleed teal, so no mask shape can reveal the white margin
 * around the artwork. The disc and the measurement behind it live in tools/brand-mark.mjs,
 * shared with the launch-screen generator.
 */
async function fullBleed(size) {
  return sharp({ create: { width: size, height: size, channels: 4, background: BRAND } })
    .composite([{ input: await disc(size) }])
    .png()
    .toBuffer()
}

for (const app of APPS) {
  const out = resolve(ROOT, `web/apps/${app}/public/icons`)
  await mkdir(out, { recursive: true })

  for (const size of STANDARD) {
    await sharp(MARK).resize(size, size).png().toFile(`${out}/icon-${size}.png`)
  }

  for (const size of MASKABLE) {
    await writeFile(`${out}/maskable-${size}.png`, await fullBleed(size))
  }

  for (const size of APPLE) {
    await writeFile(`${out}/apple-touch-icon-${size}.png`, await fullBleed(size))
  }

  await writeFile(
    resolve(ROOT, `web/apps/${app}/public/apple-touch-icon.png`),
    await fullBleed(180),
  )

  await writeFile(
    `${out}/README.md`,
    '# Generated\n\nDo not edit by hand. Run `node scripts/generate-icons.mjs`\n' +
      'after replacing `web/packages/ui/src/brand/mark.png`.\n',
  )
  console.log(`icons → web/apps/${app}/public/icons`)
}
