/**
 * Baseline capture for the parent-app Stitch redesign, Step 0.3.
 *
 * Eight surfaces, 390x844, light and dark. Signs in through §19.4's dev route as the
 * persona each screen needs, so the capture never depends on a session left behind by a
 * previous run.
 *
 * Run it as ONE process (audit README's first trap): the dev database is shared and
 * `pytest` truncates it, so seeding in one run and capturing in the next produces empty
 * screens that read as design defects.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const APP = 'http://localhost:5174'
const OUT = process.argv[2]
const ONLY = process.argv[3] ?? ''
mkdirSync(OUT, { recursive: true })

/** #/student/<id> needs a real id, so the list is resolved after sign-in. */
const SCREENS = [
  { n: '1', slug: 'home', persona: 'parent3', hash: '#/' },
  { n: '4', slug: 'student-card', persona: 'parent3', hash: 'STUDENT' },
  { n: '5', slug: 'payments', persona: 'parent3', hash: '#/payments' },
  { n: '6', slug: 'calendar', persona: 'parent3', hash: '#/calendar' },
  { n: '7', slug: 'inbox', persona: 'parent3', hash: '#/announcements' },
  { n: '8', slug: 'profile', persona: 'parent3', hash: '#/profile' },
  // Screen 2 is the signed-OUT app: no persona, no cookie.
  { n: '2', slug: 'signin', persona: null, hash: '#/' },
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
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        locale: 'he-IL',
        timezoneId: 'Asia/Jerusalem',
        colorScheme: theme,
      })
      const page = await ctx.newPage()
      page.on('console', (m) => {
        if (m.type() === 'error') console.log(`    console.error: ${m.text().slice(0, 160)}`)
      })
      // The preference is read before React paints, so it must be in storage on the
      // app's own origin before the first navigation.
      await page.addInitScript(
        (t) => globalThis.localStorage.setItem('studio.theme', t),
        theme,
      )
      if (s.persona) {
        await page.goto(
          `${APP}/api/v1/dev/sign-in-as/${s.persona}?app=parent&return_path=${encodeURIComponent(s.hash === 'STUDENT' ? '/' : '/' + s.hash)}`,
          { waitUntil: 'networkidle' },
        )
      } else {
        await page.goto(APP, { waitUntil: 'networkidle' })
      }
      // §6.1's plan step is CLIENT state (`PaymentSetupGate` holds a `done` flag), so a
      // fresh context meets it again however many times the account has passed it. Stood
      // down here rather than seeded away, because screen 3 still has to photograph it.
      const later = page.locator('[data-testid="setup-later"], [data-testid="setup-finish"]')
      if (await later.count()) {
        await later.first().click()
        await page.waitForTimeout(500)
      }

      let hash = s.hash
      if (hash === 'STUDENT') {
        // The §11.7 cookie is a REFRESH cookie: `/me/students` reads the bearer, so a
        // plain credentialed fetch answers 401 and the card silently fell back to home.
        const id = await page.evaluate(async () => {
          const session = await fetch('/api/v1/auth/refresh', {
            method: 'POST',
            credentials: 'include',
          }).then((r) => r.json())
          const r = await fetch('/api/v1/me/students', {
            credentials: 'include',
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          const j = await r.json()
          return (j.items ?? j)[0]?.id ?? ''
        })
        hash = id ? `#/student/${id}` : '#/'
        if (!id) console.log('    !! no student id — student card falls back to home')
      }
      if (hash && hash !== '#/') {
        await page.evaluate((h) => { globalThis.location.hash = h }, hash)
        await page.waitForTimeout(700)
      }
      await shot(page, `${s.n}-${s.slug}-${theme}`)
      await ctx.close()
    }
  }
  await browser.close()
}

run().catch((e) => { console.error(e); process.exit(1) })
