// The launch screens, guarded where they can silently fall apart.
//
// Nothing here fails loudly. A missing file, a filename that drifts from its media query,
// or a device in the table with no PNG behind it all produce the same thing: the white
// flash the feature exists to remove, on one model of phone, which nobody on this project
// owns. So the three parts — the table, the files on disk, the tags in the HTML — are
// checked against each other rather than trusted.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SPLASH_DIR,
  SPLASH_SCHEMES,
  SPLASH_SCREENS,
  splashFile,
  splashLinks,
  splashMedia,
} from '../splash-screens.mjs'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** The two installable phone apps. The dashboard is the manager's desktop tool. */
const PHONE_APPS = ['parent', 'staff'] as const

const screens = SPLASH_SCREENS
const schemes = SPLASH_SCHEMES

describe('the device table', () => {
  it('names each device once per scheme and no device twice', () => {
    const keys = screens.map((s) => `${s.width}x${s.height}@${s.ratio}`)
    expect(new Set(keys).size, `duplicate device: ${keys.join(', ')}`).toBe(keys.length)
  })

  it('is portrait throughout, which is what both manifests declare', () => {
    for (const screen of screens) {
      expect(screen.height, screen.note).toBeGreaterThan(screen.width)
    }
    for (const screen of screens) {
      expect(splashMedia(screen, 'light')).toContain('(orientation: portrait)')
    }
  })
})

describe('every declared screen has a file behind it', () => {
  it.each(PHONE_APPS)('%s has one PNG per device per scheme', (app) => {
    for (const scheme of schemes) {
      for (const screen of screens) {
        const file = resolve(WEB, `apps/${app}/public/${SPLASH_DIR}/${splashFile(screen, scheme)}`)
        expect(existsSync(file), `${screen.note} (${scheme}): ${file}`).toBe(true)
      }
    }
  })

  it.each(PHONE_APPS)('%s ships no PNG the table does not name', (app) => {
    // The other direction. A device dropped from the table leaves an orphan that nothing
    // references and that still costs a megabyte in the repo.
    const dir = resolve(WEB, `apps/${app}/public/${SPLASH_DIR}`)
    const onDisk = readdirSync(dir).filter((f) => f.endsWith('.png'))
    const expected = schemes.flatMap((scheme) => screens.map((s) => splashFile(s, scheme)))
    expect(onDisk.sort()).toEqual(expected.sort())
  })
})

describe('the tags', () => {
  it('point at exactly the files that exist, one per device per scheme', () => {
    const links = splashLinks()
    expect(links).toHaveLength(screens.length * schemes.length)
    for (const { href } of links) {
      expect(existsSync(resolve(WEB, `apps/parent/public${href}`)), href).toBe(true)
    }
  })

  it('gives each device a query no other device also matches', () => {
    // iOS takes the first tag whose media matches. Two tags matching one phone means the
    // splash you get depends on list order, which is not a decision anybody made.
    const medias = splashLinks().map((link) => link.media)
    expect(new Set(medias).size).toBe(medias.length)
  })

  it('asks iOS about the scheme, or a dark app launches behind a white screen', () => {
    const links = splashLinks()
    for (const { href, media } of links) {
      const scheme = href.includes('-dark.png') ? 'dark' : 'light'
      expect(media).toContain(`(prefers-color-scheme: ${scheme})`)
    }
  })
})

describe('the build wiring', () => {
  it.each(PHONE_APPS)('%s registers the plugin that injects the tags', (app) => {
    // Without this the files ship and no tag references them: 800KB of dead weight and the
    // white flash still there. Nothing about that is visible in a build log.
    const config = readFileSync(resolve(WEB, `apps/${app}/vite.config.ts`), 'utf8')
    expect(config).toContain('splashLinksPlugin()')
  })

  it.each(PHONE_APPS)('%s keeps the launch screens out of the offline precache', (app) => {
    // They are read by iOS before the page exists and never by the app, so precaching them
    // spends the budget §6.1 reserves for the font on bytes no offline session can use.
    const config = readFileSync(resolve(WEB, `apps/${app}/vite.config.ts`), 'utf8')
    expect(config).toContain("globIgnores: ['**/splash/*.png']")
  })

  it('leaves the dashboard without launch screens, which is the decision', () => {
    expect(existsSync(resolve(WEB, `apps/dashboard/public/${SPLASH_DIR}`))).toBe(false)
    expect(readFileSync(resolve(WEB, 'apps/dashboard/vite.config.ts'), 'utf8')).not.toContain(
      'splashLinksPlugin',
    )
  })
})
