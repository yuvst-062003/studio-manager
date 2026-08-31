/**
 * Screen 3's baseline — every step of §6.1's signing flow, photographed as it ships.
 *
 * The flow cannot be walked by clicking alone in a reasonable time: the health form has
 * fourteen questions plus a derived clause per child, and a script that mis-answers one
 * of them loops forever on `יש לענות על כל השאלות`. So each step is REACHED by satisfying
 * the ones before it through the API, and photographed in the browser. The screen is real
 * either way — what is skipped is the typing, not the rendering.
 *
 * The point of this capture is the REPETITION, so child 1 and child 2 are both
 * photographed at the registration step.
 *
 * Order matters and mirrors `App.tsx:591`: consent (per person) → per child
 * [registration → health → club terms (per person)] → the payment gate.
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const APP = 'http://localhost:5174'
const OUT = process.argv[2]
const THEME = process.argv[3] ?? 'light'
mkdirSync(OUT, { recursive: true })

const shot = async (page, name) => {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true })
  await page.screenshot({ path: `${OUT}/${name}-viewport.png`, fullPage: false })
  const h = await page.evaluate(() => document.body.scrollHeight)
  const step = await page
    .locator('[data-testid^="agreement-step-"], [data-testid="consent-gate"], [data-testid="payment-setup"]')
    .first()
    .getAttribute('data-testid')
    .catch(() => null)
  console.log(`  ${name}  ${h}px tall  on=${step}`)
}

/** Everything the page needs to talk to the API the way the app does. */
const API = `
  const session = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.json())
  const auth = { Authorization: 'Bearer ' + session.access_token }
  const get = (p) => fetch(p, { credentials: 'include', headers: auth }).then((r) => r.json())
  const send = (p, method, body) =>
    fetch(p, {
      method,
      credentials: 'include',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (r) => ({ ok: r.ok, status: r.status, body: r.ok ? await r.json() : await r.text() }))
  const validId = (seed) => {
    for (let n = seed; n < seed + 10000; n += 1) {
      const p = String(n).padStart(9, '0')
      let t = 0
      for (let i = 0; i < 9; i += 1) { const x = Number(p[i]) * ((i % 2) + 1); t += x > 9 ? x - 9 : x }
      if (t % 10 === 0) return p
    }
  }
  const registrationFor = (index) => ({
    child: {
      national_id: validId(300000000 + index * 7919),
      address: 'הרצל 14', city: 'תל אביב', grade: "ג'",
      phone_home: '03-5551234', phone: '050-5551234', email: 'shira@example.com',
    },
    signer: {
      first_name: 'שירה', last_name: 'הורה', national_id: validId(200000000),
      phone: '050-5551234', aliyah_year: '1998',
    },
    other_parent: {
      first_name: 'דנה', last_name: 'לוי', national_id: validId(210000000), phone: '052-5554321',
    },
    pickup_contacts: [{ name: 'רותי כהן', phone: '054-5559876', relation: 'סבתא' }],
  })
`

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    colorScheme: THEME,
  })
  const page = await ctx.newPage()
  await page.addInitScript((t) => globalThis.localStorage.setItem('studio.theme', t), THEME)
  await page.goto(`${APP}/api/v1/dev/sign-in-as/parent3?app=parent&return_path=%2F`, {
    waitUntil: 'networkidle',
  })

  // ── step 5 · the consent gate, per PERSON ───────────────────────────────────
  await page.waitForSelector('[data-testid="consent-gate"]', { timeout: 20000 })
  await shot(page, `3a-consent-${THEME}`)
  await page.evaluate(`(async () => {
    ${API}
    const c = await get('/api/v1/privacy/consents')
    const grants = {}
    for (const item of c.outstanding ?? []) grants[item.kind ?? item] = true
    if (Object.keys(grants).length) await send('/api/v1/privacy/consents', 'POST', { version: c.policy_version, grants })
  })()`)
  await page.reload({ waitUntil: 'networkidle' })

  // ── step 1 · registration, child 1 ──────────────────────────────────────────
  await page.waitForSelector('[data-testid="agreement-step-registration"]', { timeout: 20000 })
  await shot(page, `3b-registration-child1-${THEME}`)

  const fieldCount = await page.locator('form input').count()
  console.log(`  registration asks ${fieldCount} inputs per child`)

  // Satisfy child 1's registration and health so the CLUB TERMS step is what renders.
  await page.evaluate(`(async () => {
    ${API}
    const students = (await get('/api/v1/me/students')).items
    const list = await get('/api/v1/health-templates?kind=full')
    const current = list.items.reduce((b, i) => (b === null || i.version > b.version ? i : b), null)
    const template = await get('/api/v1/health-templates/' + current.id)
    const answers = { clause_confirmed: 'none' }
    for (const s of template.schema.sections ?? [])
      for (const q of s.questions ?? []) {
        if (q.id === 'clause_confirmed') continue
        if (q.type === 'boolean') answers[q.id] = false
        else if (q.required === true) answers[q.id] = 'לא'
      }
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const first = students[0].id
    await send('/api/v1/students/' + first + '/agreement/registration', 'PUT', registrationFor(0))
    await send('/api/v1/students/' + first + '/health-declaration', 'POST', {
      template_id: current.id, answers, signature_image_base64: png,
    })
    globalThis.__students = students.map((s) => s.id)
    globalThis.__template = { id: current.id, answers, png }
  })()`)
  await page.reload({ waitUntil: 'networkidle' })

  // ── step 2 · the health declaration, as child 1 saw it ──────────────────────
  // Photographed from child 2, whose declaration is still outstanding — same screen,
  // and it keeps child 1's completed state intact for the club-terms shot below.
  // (Reached after the terms step, so it is captured further down.)

  // ── step 3 · the club תקנון, per PERSON ─────────────────────────────────────
  const onTerms = await page
    .waitForSelector('[data-testid="agreement-step-terms"]', { timeout: 20000 })
    .catch(() => null)
  if (onTerms) {
    await shot(page, `3d-club-terms-${THEME}`)
    await page.evaluate(`(async () => {
      ${API}
      const students = (await get('/api/v1/me/students')).items
      await send('/api/v1/students/' + students[0].id + '/agreement/club-terms', 'POST', { accepted: true, version: 1 })
    })()`)
    await page.reload({ waitUntil: 'networkidle' })
  } else {
    console.log('  !! club-terms step not reached')
  }

  // ── child 2 · the repetition, which is the finding ──────────────────────────
  await page.waitForSelector('[data-testid="agreement-step-registration"]', { timeout: 20000 })
  await shot(page, `3b-registration-child2-${THEME}`)

  // Child 2's registration only, so the HEALTH step is what renders next.
  await page.evaluate(`(async () => {
    ${API}
    const students = (await get('/api/v1/me/students')).items
    await send('/api/v1/students/' + students[1].id + '/agreement/registration', 'PUT', registrationFor(1))
  })()`)
  await page.reload({ waitUntil: 'networkidle' })

  await page.waitForSelector('[data-testid="agreement-step-health"]', { timeout: 20000 })
  await shot(page, `3c-health-child2-${THEME}`)

  // ── the payment gate ────────────────────────────────────────────────────────
  await page.evaluate(`(async () => {
    ${API}
    const students = (await get('/api/v1/me/students')).items
    const list = await get('/api/v1/health-templates?kind=full')
    const current = list.items.reduce((b, i) => (b === null || i.version > b.version ? i : b), null)
    const template = await get('/api/v1/health-templates/' + current.id)
    const answers = { clause_confirmed: 'none' }
    for (const s of template.schema.sections ?? [])
      for (const q of s.questions ?? []) {
        if (q.id === 'clause_confirmed') continue
        if (q.type === 'boolean') answers[q.id] = false
        else if (q.required === true) answers[q.id] = 'לא'
      }
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    for (const [i, s] of students.entries()) {
      await send('/api/v1/students/' + s.id + '/agreement/registration', 'PUT', registrationFor(i))
      await send('/api/v1/students/' + s.id + '/health-declaration', 'POST', {
        template_id: current.id, answers, signature_image_base64: png,
      })
      await send('/api/v1/students/' + s.id + '/agreement/club-terms', 'POST', { accepted: true, version: 1 })
    }
  })()`)
  await page.reload({ waitUntil: 'networkidle' })

  const onSetup = await page
    .waitForSelector('[data-testid="payment-setup"]', { timeout: 20000 })
    .catch(() => null)
  if (onSetup) await shot(page, `3e-payment-setup-${THEME}`)
  else console.log('  !! payment gate not reached')

  await ctx.close()
  await browser.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
