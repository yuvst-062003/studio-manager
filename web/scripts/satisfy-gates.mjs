/**
 * Puts `parent3` through §6.1's gates for every child, so the six screens behind them can
 * be captured. Not a test and not a fixture — a capture aid.
 *
 * It posts through the app's OWN origin with the session cookie, so every server rule
 * still applies: the ת.ז. check digit, the template-version echo, and `verify_clause`.
 * Building the answers FROM the template rather than from a hardcoded list is what keeps
 * it working when the club edits its questionnaire.
 */
import { chromium } from 'playwright'

const APP = 'http://localhost:5174'

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'he-IL' })
  const page = await ctx.newPage()
  await page.goto(`${APP}/api/v1/dev/sign-in-as/parent3?app=parent&return_path=%2F`, {
    waitUntil: 'networkidle',
  })

  const report = await page.evaluate(async () => {
    const out = []
    // The §11.7 cookie is a REFRESH cookie, not an access token: every studio-scoped route
    // reads the bearer, so a plain `credentials: 'include'` fetch gets `no active studio`.
    // `setAccessToken` is module-scoped and deliberately unreachable from here, so the
    // token is minted the same way the app mints it — by spending the cookie once.
    const session = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    }).then((r) => r.json())
    const auth = { Authorization: `Bearer ${session.access_token}` }
    const get = (p) => fetch(p, { credentials: 'include', headers: auth }).then((r) => r.json())
    const send = async (p, method, body) => {
      const r = await fetch(p, {
        method,
        credentials: 'include',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return { ok: r.ok, status: r.status, body: r.ok ? await r.json() : await r.text() }
    }

    /** Passes the ת.ז. check digit. Arithmetic only — nobody's identity. */
    const validId = (seed) => {
      for (let n = seed; n < seed + 10000; n += 1) {
        const p = String(n).padStart(9, '0')
        let t = 0
        for (let i = 0; i < 9; i += 1) {
          const x = Number(p[i]) * ((i % 2) + 1)
          t += x > 9 ? x - 9 : x
        }
        if (t % 10 === 0) return p
      }
      throw new Error('no valid id')
    }

    // The newest `full` template, chosen the way the client chooses it — by highest
    // version, never items[0]. A superseded template satisfies no gate.
    const list = await get('/api/v1/health-templates?kind=full')
    const current = list.items.reduce((b, i) => (b === null || i.version > b.version ? i : b), null)
    const template = await get(`/api/v1/health-templates/${current.id}`)
    const schema = template.schema

    // A 1x1 transparent PNG. The pad produces a real drawing; the server stores bytes.
    const signature =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

    // §6.1 step 5 — ToS and the privacy policy, per PERSON. Outside the per-child loop
    // because it is asked once, and BEFORE it because the same ordering argument applies:
    // the policy is what permits the club to hold the record the loop is about to write.
    const consents = await get('/api/v1/privacy/consents')
    const grants = {}
    for (const item of consents.outstanding ?? []) grants[item.kind ?? item] = true
    // An empty `outstanding` means this person has already consented — the route rejects
    // an empty `grants` map, so posting one anyway would turn "nothing to do" into a 422.
    const consented = Object.keys(grants).length
      ? await send('/api/v1/privacy/consents', 'POST', {
          version: consents.policy_version,
          grants,
        })
      : { ok: true, status: 'already granted', body: consents }
    out.push({
      name: '(consent, per person)',
      registration: consented.status,
      declaration: '—',
      terms: '—',
      status: consented.ok ? 'ok' : String(consented.body).slice(0, 200),
    })

    const students = await get('/api/v1/me/students')
    for (const [index, student] of (students.items ?? students).entries()) {
      const id = student.id
      const name = student.display_name ?? id

      const registration = await send(`/api/v1/students/${id}/agreement/registration`, 'PUT', {
        child: {
          national_id: validId(300000000 + index * 7919),
          address: 'הרצל 14',
          city: 'תל אביב',
          grade: "ג'",
          phone_home: '03-5551234',
          phone: '050-5551234',
          email: 'shira@example.com',
        },
        signer: {
          first_name: 'שירה',
          last_name: 'הורה',
          national_id: validId(200000000),
          phone: '050-5551234',
          aliyah_year: '1998',
        },
        other_parent: {
          first_name: 'דנה',
          last_name: 'לוי',
          national_id: validId(210000000),
          phone: '052-5554321',
        },
        pickup_contacts: [{ name: 'רותי כהן', phone: '054-5559876', relation: 'סבתא' }],
      })

      // Every answer is "no" / blank, so `applicable_clause` resolves to `none` and
      // `verify_clause` accepts the confirmation below. Derived from the schema rather
      // than listed, so a reworded questionnaire does not silently answer nothing.
      const answers = {}
      for (const section of schema.sections ?? []) {
        for (const q of section.questions ?? []) {
          if (q.id === 'clause_confirmed') continue
          if (q.type === 'boolean') answers[q.id] = false
          else if (q.required === true) answers[q.id] = 'לא'
        }
      }
      answers.clause_confirmed = 'none'

      const declaration = await send(`/api/v1/students/${id}/health-declaration`, 'POST', {
        template_id: current.id,
        answers,
        signature_image_base64: signature,
      })

      // Per SIGNING PERSON, so only the first child is ever asked. Posted for each anyway:
      // the endpoint is idempotent and the status read below is the authority.
      const terms = await send(`/api/v1/students/${id}/agreement/club-terms`, 'POST', {
        accepted: true,
        version: 1,
      })

      const status = await get(`/api/v1/students/${id}/agreement`)
      out.push({
        name,
        registration: registration.status,
        declaration: declaration.status,
        terms: terms.status,
        termsDetail: terms.ok ? '' : String(terms.body).slice(0, 160),
        declarationDetail: declaration.ok ? '' : String(declaration.body).slice(0, 200),
        status,
      })
    }
    return out
  })

  for (const r of report) {
    console.log(
      `  ${r.name}: registration=${r.registration} declaration=${r.declaration} terms=${r.terms} → ${JSON.stringify(r.status)}`,
    )
    if (r.declarationDetail) console.log(`    declaration said: ${r.declarationDetail}`)
    if (r.termsDetail) console.log(`    terms said: ${r.termsDetail}`)
  }
  await ctx.close()
  await browser.close()
}

run().catch((e) => {
  console.error(e)
  process.exit(1)
})
