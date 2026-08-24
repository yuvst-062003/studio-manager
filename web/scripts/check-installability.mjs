#!/usr/bin/env node
/**
 * Fail the build when an app stops being installable.
 *
 * §6.5 makes the install the product's main adoption risk: there is no store
 * listing to fall back on, and on iOS there is no way to trigger an install at
 * all. A regression here surfaces on a parent's phone, which is the one place it
 * must not. So it fails CI instead.
 *
 * Lighthouse's PWA category was removed in v12 — verified absent in 13.4.1,
 * which has no `installable` audit at all — so there is no off-the-shelf gate to
 * call. The explicit criteria in auditManifest() are therefore the real check.
 *
 * CDP Page.getInstallabilityErrors is queried too, but measured rather than
 * trusted: against a deliberately broken manifest (display:browser) headless
 * Chromium still returned an empty array, so it can add a signal and never
 * subtract one. Do not weaken the explicit criteria on the assumption that
 * Chromium's own verdict is covering them.
 */
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const APPS = ['staff', 'parent', 'dashboard']

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
}

/** The manifest half of Chromium's installability criteria, asserted explicitly. */
export function auditManifest(m) {
  const errors = []
  if (!m.name) errors.push('manifest.name is empty')
  if (!m.short_name) errors.push('manifest.short_name is empty')
  if (!['standalone', 'fullscreen', 'minimal-ui'].includes(m.display)) {
    errors.push(`manifest.display is "${m.display}" — must not launch in browser chrome`)
  }
  if (!m.start_url) errors.push('manifest.start_url is missing')
  if (m.scope && m.start_url && !m.start_url.startsWith(m.scope)) {
    errors.push(`manifest.start_url "${m.start_url}" is outside scope "${m.scope}"`)
  }
  if (!m.theme_color) errors.push('manifest.theme_color is missing')
  if (!m.background_color) errors.push('manifest.background_color is missing')

  const icons = m.icons ?? []
  const has = (size) => icons.some((i) => (i.sizes ?? '').split(' ').includes(size))
  if (!has('192x192')) errors.push('no 192x192 icon — Chromium requires it to install')
  if (!has('512x512')) errors.push('no 512x512 icon — Chromium requires it to install')
  if (!icons.some((i) => (i.purpose ?? '').includes('maskable'))) {
    errors.push('no maskable icon — Android will letterbox the mark')
  }
  if (icons.some((i) => i.type !== 'image/png')) {
    errors.push('every icon must declare type image/png')
  }
  return errors
}

const serve = (dir) =>
  new Promise((ok) => {
    const server = createServer(async (req, res) => {
      const path = (req.url ?? '/').split('?')[0]
      const candidates = [join(dir, path), join(dir, path, 'index.html'), join(dir, 'index.html')]
      for (const candidate of candidates) {
        try {
          const body = await readFile(candidate)
          res.writeHead(200, {
            'content-type': MIME[extname(candidate)] ?? 'application/octet-stream',
          })
          return res.end(body)
        } catch {
          // try the next candidate
        }
      }
      res.writeHead(404).end()
    })
    server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port }))
  })

async function checkApp(app) {
  const { server, port } = await serve(resolve(ROOT, `web/apps/${app}/dist`))
  const browser = await chromium.launch()
  const errors = []
  const origin = `http://127.0.0.1:${port}`
  try {
    const page = await browser.newPage()
    // localhost is a secure context, so service workers and install criteria apply.
    await page.goto(`${origin}/`, { waitUntil: 'load' })

    const href = await page.getAttribute('link[rel="manifest"]', 'href')
    if (!href) errors.push('no <link rel="manifest"> in the served HTML')

    if (!(await page.getAttribute('link[rel="apple-touch-icon"]', 'href'))) {
      errors.push('no apple-touch-icon — iOS falls back to a screenshot of the page')
    }

    if (href) {
      const manifest = await page.evaluate(
        async (url) => (await fetch(url)).json(),
        new URL(href, `${origin}/`).href,
      )
      errors.push(...auditManifest(manifest))

      // Every declared icon must actually resolve. A 404 icon is invisible in the
      // manifest JSON and fatal at install time.
      for (const icon of manifest.icons ?? []) {
        const res = await page.request.get(new URL(icon.src, `${origin}/`).href)
        if (!res.ok()) errors.push(`icon ${icon.src} returned ${res.status()}`)
      }
    }

    const swState = await page.evaluate(async () => {
      if (!navigator.serviceWorker) return 'unsupported'
      await navigator.serviceWorker.register('/sw.js')
      const reg = await navigator.serviceWorker.ready
      const worker = reg.active
      if (!worker) return 'none'
      if (worker.state === 'activated') return 'activated'
      // `ready` resolves as soon as there is an active worker, which may still be
      // 'activating'. Reading the state straight after therefore races.
      return await new Promise((done) => {
        const timer = setTimeout(() => done(worker.state), 10_000)
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') {
            clearTimeout(timer)
            done('activated')
          }
        })
      })
    })
    if (swState !== 'activated') errors.push(`service worker did not activate (state: ${swState})`)

    // Opportunistic: see the header note. Adds signal when present, proves
    // nothing when empty.
    try {
      const cdp = await page.context().newCDPSession(page)
      const { installabilityErrors = [] } = await cdp.send('Page.getInstallabilityErrors')
      for (const e of installabilityErrors) errors.push(`chromium: ${e.errorId}`)
    } catch {
      console.warn('    (Page.getInstallabilityErrors unavailable — using explicit criteria)')
    }

    const fontOk = await page.evaluate(async () => {
      await document.fonts.ready
      return document.fonts.check('1rem "Rubik Variable"')
    })
    if (!fontOk) errors.push('Rubik did not load — D6 is the only family covering he+en+ru')

    const dir = await page.evaluate(() => document.documentElement.dir)
    if (dir !== 'rtl') errors.push(`document dir is "${dir}", expected "rtl" (SPEC §9)`)
  } finally {
    await browser.close()
    server.close()
  }
  return errors
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const only = process.argv.includes('--app')
    ? [process.argv[process.argv.indexOf('--app') + 1]]
    : APPS
  let failed = false
  for (const app of only) {
    const errors = await checkApp(app)
    if (errors.length) {
      failed = true
      console.error(`✗ ${app}`)
      errors.forEach((e) => console.error(`    ${e}`))
    } else {
      console.log(`✓ ${app} is installable`)
    }
  }
  process.exit(failed ? 1 : 0)
}
