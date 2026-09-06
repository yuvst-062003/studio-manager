// The club's mark, and the one measurement every generator needs from it.
//
// Extracted from scripts/generate-icons.mjs when the launch-screen generator needed the
// same disc. `DISC_RATIO` is measured off the artwork, not chosen — two copies of a
// measured constant drift the first time the mark is replaced and only one is updated,
// and the symptom would be a visible seam on one asset family and not the other.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** The club's own mark: a white judogi with a black belt on a teal disc, 512×512. */
export const MARK = resolve(ROOT, 'web/packages/ui/src/brand/mark.png')

/** Sampled from the disc in mark.png. */
export const BRAND = '#24516f'

/**
 * The disc's radius as a fraction of the canvas. Measured, not guessed: the disc spans
 * x=4..509 of 512, so its radius is 253 — and the mask is set a few pixels INSIDE that.
 * The outermost pixels are the artwork's own antialiased rim, a lighter teal, and leaving
 * them in draws a visible seam where the disc meets whatever it is laid on.
 */
export const DISC_RATIO = 249 / 512

/**
 * The mark with its white margin removed — the disc alone, transparent outside it.
 *
 * `dest-in` keeps only the pixels under the mask, which turns the circle into the alpha
 * channel. What the caller composites this onto decides what the margin becomes: full-bleed
 * teal for an icon, the app's own ground for a launch screen.
 */
export async function disc(size) {
  const radius = Math.round(size * DISC_RATIO)
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="#fff"/></svg>`,
  )
  return sharp(MARK)
    .resize(size, size)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer()
}
