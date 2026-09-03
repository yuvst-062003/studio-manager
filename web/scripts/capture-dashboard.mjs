/**
 * The "after" capture for the dashboard redesign (docs/design/proposals/dashboard-screens-redesign.md,
 * Part E step 4 — "look at it").
 *
 * Six screens, the same six the owner screenshotted on 2026-09-02, at the width they were
 * complained about. Modelled on capture-parent.mjs, which is the working precedent in this
 * repo; the differences are the origin (the dashboard is 5175), the persona (`manager`),
 * and the viewport.
 *
 * Run it as ONE process (audit README's first trap): the dev database is shared and
 * `pytest` truncates it, so seeding in one run and capturing in the next produces empty
 * screens that read as design defects.
 *
 *   node scripts/capture-dashboard.mjs ../docs/screenshots/dashboard/after
 *   node scripts/capture-dashboard.mjs <out> <slug>          # one screen
 *   node scripts/capture-dashboard.mjs <out> '' mobile       # 390x844 instead of 1440x900
 *
 * The demo studio's numbers are all zero, which is the state that broke B5 — that is the
 * point of capturing against it rather than against a full studio.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const APP = 'http://localhost:5175'
const OUT = process.argv[2]
const ONLY = process.argv[3] ?? ''
/* `wide` is the viewport A3 exists for: the owner's monitor, where an uncapped `<main>`
 * became a 2400-pixel text column. At 1440 the 1200px cap barely binds, so a capture at
 * that width cannot show whether the fix works. */
const SIZES = {
  mobile: { width: 390, height: 844 },
  wide: { width: 2560, height: 1200 },
}
const SIZE = SIZES[process.argv[4]] ?? { width: 1440, height: 900 }
mkdirSync(OUT, { recursive: true })

/** Slugs match the six complaints in the proposal's "What this is" table. */
const SCREENS = [
  { n: '1', slug: 'attendance', hash: '#/attendance' },
  { n: '2', slug: 'students', hash: '#/students' },
  { n: '3', slug: 'groups', hash: '#/groups' },
  { n: '4', slug: 'staff', hash: '#/staff' },
  { n: '5', slug: 'reports', hash: '#/reports' },
  // The proposal's B6 header says `#/`, but `#/` resolves to the WEEK BOARD — the manager
  // home is mounted at `#/home` (App.tsx:191, 250). Capturing `#/` photographs the wrong
  // screen entirely, which is exactly the mistake this pass exists to catch.
  { n: '6', slug: 'home', hash: '#/home' },
]

const shot = async (page, name) => {
  await page.waitForTimeout(900)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  const text = await page.evaluate(() => document.body.innerText.slice(0, 400))
  console.log(`  ${name}  ${text.replace(/\s+/g, ' ').slice(0, 110)}`)
}

const run = async () => {
  const browser = await chromium.launch()
  for (const theme of ['light', 'dark']) {
    for (const s of SCREENS) {
      if (ONLY && ONLY !== s.slug) continue
      const ctx = await browser.newContext({
        viewport: SIZE,
        deviceScaleFactor: 2,
        locale: 'he-IL',
        timezoneId: 'Asia/Jerusalem',
        colorScheme: theme,
      })
      const page = await ctx.newPage()
      // A console error on a redesigned screen is a finding, not noise — the whole point
      // of this pass is to see what a unit test cannot.
      page.on('console', (m) => {
        if (m.type() === 'error') console.log(`    console.error: ${m.text().slice(0, 160)}`)
      })
      // The preference is read before React paints, so it must be in storage on the app's
      // own origin before the first navigation.
      await page.addInitScript((t) => globalThis.localStorage.setItem('studio.theme', t), theme)
      await page.goto(
        `${APP}/api/v1/dev/sign-in-as/manager?app=dashboard&return_path=${encodeURIComponent('/')}`,
        { waitUntil: 'networkidle' },
      )
      if (s.hash !== '#/') {
        await page.evaluate((h) => {
          globalThis.location.hash = h
        }, s.hash)
        await page.waitForTimeout(700)
      }
      await shot(page, `${s.n}-${s.slug}-${theme}`)
      await ctx.close()
    }
  }
  await browser.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
