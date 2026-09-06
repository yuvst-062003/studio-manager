// iOS launch screens: the device table, the filenames, and the <link> tags — one list.
//
// **Why any of this exists.** Tapping a home-screen web app on iOS shows a blank white
// rectangle until the first paint. Android draws the manifest's `background_color` and icon
// for that moment; iOS reads neither, and the only thing it will show is an image supplied
// through `apple-touch-startup-image` whose `media` query matches the device exactly. No
// matching tag means the white flash, which is the loudest remaining tell that the thing
// you tapped is a web page.
//
// **One table, three consumers.** scripts/generate-splash.mjs rasterises from it, the Vite
// plugin below injects the tags from it, and tools/__tests__/splash-screens.test.ts checks
// the two agree. Hand-writing thirty <link> tags in each index.html would mean a filename
// and a media query maintained in two places, and a mismatch there fails the way this
// whole feature fails — silently, as the white screen it was meant to remove.
//
// **Portrait only.** Both installable apps declare `orientation: 'portrait'`.
//
// **Sizes are CSS pixels; the file is `ratio` times bigger in each axis.** That is what the
// media query asks about and what iOS then expects to receive.

/** @typedef {{ width: number, height: number, ratio: number, note: string }} SplashScreen */

/**
 * The devices worth carrying. Not exhaustive on purpose: an unmatched device falls back to
 * today's behaviour (a white flash), so the cost of omitting an eleven-year-old phone is
 * that it stays exactly as it is now, while the cost of including everything is a hundred
 * committed PNGs.
 *
 * @type {readonly SplashScreen[]}
 */
export const SPLASH_SCREENS = [
  { width: 440, height: 956, ratio: 3, note: 'iPhone 16 Pro Max' },
  { width: 430, height: 932, ratio: 3, note: 'iPhone 16 Plus, 15 Pro Max, 15 Plus, 14 Pro Max' },
  { width: 428, height: 926, ratio: 3, note: 'iPhone 14 Plus, 13 Pro Max, 12 Pro Max' },
  { width: 414, height: 896, ratio: 3, note: 'iPhone 11 Pro Max, XS Max' },
  { width: 414, height: 896, ratio: 2, note: 'iPhone 11, XR' },
  { width: 402, height: 874, ratio: 3, note: 'iPhone 16 Pro' },
  { width: 393, height: 852, ratio: 3, note: 'iPhone 16, 15 Pro, 15, 14 Pro' },
  { width: 390, height: 844, ratio: 3, note: 'iPhone 14, 13 Pro, 13, 12 Pro, 12' },
  { width: 375, height: 812, ratio: 3, note: 'iPhone 13 mini, 12 mini, 11 Pro, XS, X' },
  { width: 375, height: 667, ratio: 2, note: 'iPhone SE 3rd/2nd gen, 8, 7, 6s' },
  { width: 1024, height: 1366, ratio: 2, note: 'iPad Pro 12.9"' },
  { width: 834, height: 1194, ratio: 2, note: 'iPad Pro 11", Air 4th/5th gen' },
  { width: 834, height: 1112, ratio: 2, note: 'iPad Pro 10.5", Air 3rd gen' },
  { width: 820, height: 1180, ratio: 2, note: 'iPad Air 10.9", iPad 10th gen' },
  { width: 768, height: 1024, ratio: 2, note: 'iPad mini, iPad 9.7"' },
]

/** @type {readonly ('light' | 'dark')[]} */
export const SPLASH_SCHEMES = ['light', 'dark']

/** Where the files sit inside each app's `public/`, and therefore at the served root. */
export const SPLASH_DIR = 'splash'

/** @param {SplashScreen} screen @param {'light' | 'dark'} scheme */
export function splashFile(screen, scheme) {
  return `splash-${screen.width}x${screen.height}@${screen.ratio}x-${scheme}.png`
}

/**
 * The query iOS matches against. `prefers-color-scheme` is the reason there are two files
 * per device: the app follows the system theme by default, and a white launch screen in
 * front of a dark app is its own kind of flash.
 *
 * @param {SplashScreen} screen @param {'light' | 'dark'} scheme
 */
export function splashMedia(screen, scheme) {
  return (
    `(prefers-color-scheme: ${scheme})` +
    ` and (device-width: ${screen.width}px)` +
    ` and (device-height: ${screen.height}px)` +
    ` and (-webkit-device-pixel-ratio: ${screen.ratio})` +
    ' and (orientation: portrait)'
  )
}

/** Every tag, in the order they are injected. */
export function splashLinks() {
  return SPLASH_SCHEMES.flatMap((scheme) =>
    SPLASH_SCREENS.map((screen) => ({
      href: `/${SPLASH_DIR}/${splashFile(screen, scheme)}`,
      media: splashMedia(screen, scheme),
    })),
  )
}

/**
 * Injects the tags at build time so index.html stays readable and the filenames cannot
 * drift from the generator's.
 */
export function splashLinksPlugin() {
  return {
    name: 'studio:apple-splash-links',
    transformIndexHtml() {
      return splashLinks().map(({ href, media }) => ({
        tag: 'link',
        injectTo: 'head',
        attrs: { rel: 'apple-touch-startup-image', media, href },
      }))
    },
  }
}
