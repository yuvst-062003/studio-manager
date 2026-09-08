// Task 3a's own seam: `tokenSource` is lifted unchanged from `WizardJoinFlow` (door B's
// three request shapes), and `studioSource` is new (doors C/D). `apiFetch` is mocked;
// nothing here renders a screen.
import { describe, expect, it, vi } from 'vitest'
import type { HealthClient } from '../../health/healthClient'
import type { RegisterPayload } from './adapters'
import type { RegisterResult } from './submitJoin'
import { RegisterCodeError, studioSource, tokenSource } from './wizardSources'

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    apiFetch: vi.fn(),
    // A REAL origin, unlike the empty string a test build bakes in. `apiUrl` is a no-op
    // when VITE_API_ORIGIN is '', so without this the logo assertions below would pass
    // just as happily against the unfixed code that never called it at all.
    apiUrl: (path: string) => `https://api.test${path}`,
  }
})

const TOKEN = 'tok-e2e'

function healthClientStub(): HealthClient {
  return {
    template: vi.fn(async () => ({
      id: 'tmpl-1',
      version: 1,
      schema: { sections: [] },
    })),
  } as unknown as HealthClient
}

const REGISTER_PAYLOAD: RegisterPayload = {
  first_name: 'דנה',
  last_name: 'כהן',
  phone: '0501234567',
  signer: {
    national_id: '100000017',
    address: 'הרצל 1',
    city: 'תל אביב',
    phone_home: null,
    aliyah_year: null,
    relation: 'mother',
  },
  club_terms_accepted: true,
  children: [
    {
      first_name: 'נועה',
      last_name: 'כהן',
      birthdate: '2016-04-01',
      group_ids: ['g1'],
      self_student: false,
      national_id: '100000017',
      grade: 'grade_3',
      aliyah_year: null,
      price_plan_id: 'plan-1',
      belt_rank_id: null,
      other_parent: null,
      pickup_contacts: [],
      health: null,
    },
  ],
}

const REGISTER_RESPONSE: RegisterResult = {
  person_id: 'person-1',
  student_ids: ['s1'],
  child_student_ids: ['s1'],
  charges_created: 1,
}

/** The real wire shape both price-plan endpoints return -- snake_case, confirmed against
 *  `OnboardingPricePlanOut` (`app/routers/onboarding.py`) and the identical shape
 *  `/public/studios/{slug}/price-plans` returns. `PlanOption` (what `toWizardPlan` reads)
 *  is camelCase -- a source that skips this mapping hands `toWizardPlan` `undefined` for
 *  `monthlyAmountAgorot`/`sessionsPerWeek`, which is what rendered every price on door B
 *  as "NaN" until this fix. */
const WIRE_PLAN = {
  id: 'p400',
  name: 'מסלול לוחם',
  monthly_amount_agorot: 40_000,
  sessions_per_week: 3,
}

describe('tokenSource -- door B, lifted unchanged from WizardJoinFlow', () => {
  it('loadStudio calls /api/v1/public/onboarding/{token} and maps the groups', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes(`/api/v1/public/onboarding/${TOKEN}`)) {
        return new Response(
          JSON.stringify({
            studio_name: 'מועדון בדיקה',
            logo_url: null,
            groups: [{ id: 'g1', name: 'קבוצת בוקר', weekdays: [0, 2] }],
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = tokenSource(TOKEN, healthClientStub())
    const studio = await source.loadStudio()

    expect(fetchMock).toHaveBeenCalledWith(`/api/v1/public/onboarding/${TOKEN}`)
    expect(studio.studioName).toBe('מועדון בדיקה')
    expect(studio.groups).toHaveLength(1)
    // Mapped through `toWizardGroup`, not passed through raw -- `scheduleLabel` is a
    // derived field `OnboardingGroupOut` never sends, so seeing it proves the mapping ran.
    expect(studio.groups[0]?.scheduleLabel).toContain('ראשון')
    // No `club_terms_version` in this fixture's response -- an older cached response, or
    // a test that predates the field, must read as "no version", not crash.
    expect(studio.clubTermsVersion).toBeNull()
  })

  // Gap 2 -- `OnboardingInfoOut.club_terms_version` is live off the server's own
  // `CLUB_TERMS_VERSION`, so step 1 can show the family which version they are agreeing
  // to. This is the one place that reads it off the wire.
  it('loadStudio returns an ABSOLUTE logo URL, not the API path the wire carries', async () => {
    // Owner-reported 2026-09-07: the wizard's header and its success screen both drew a
    // broken image. `logo_url` is an API path, and on split origins — which every deployed
    // environment is — a relative path resolves against the PWA's host and 404s.
    // `PublicLanding` fixed exactly this on 2026-08-30; neither wizard source did.
    const { apiFetch } = await import('@studio/core')
    vi.mocked(apiFetch).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            studio_name: 'מועדון בדיקה',
            logo_url: '/api/v1/public/onboarding/tok-e2e/logo',
            groups: [],
          }),
          { status: 200 },
        ),
    )

    const studio = await tokenSource(TOKEN, healthClientStub()).loadStudio()

    expect(studio.logoUrl).toBe('https://api.test/api/v1/public/onboarding/tok-e2e/logo')
  })

  it('loadStudio keeps a missing logo null rather than building a URL that 404s', async () => {
    const { apiFetch } = await import('@studio/core')
    vi.mocked(apiFetch).mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ studio_name: 'מועדון בדיקה', logo_url: null, groups: [] }),
          { status: 200 },
        ),
    )

    const studio = await tokenSource(TOKEN, healthClientStub()).loadStudio()

    expect(studio.logoUrl).toBeNull()
  })

  it('loadStudio maps club_terms_version onto clubTermsVersion', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes(`/api/v1/public/onboarding/${TOKEN}`)) {
        return new Response(
          JSON.stringify({
            studio_name: 'מועדון בדיקה',
            logo_url: null,
            groups: [],
            club_terms_version: 3,
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = tokenSource(TOKEN, healthClientStub())
    const studio = await source.loadStudio()

    expect(studio.clubTermsVersion).toBe(3)
  })

  // Task 10 item 3 -- `OnboardingInfoOut.slug` was already on this response; step 2's
  // "try a trial lesson first" link is the first thing to read it back.
  it('loadStudio maps slug onto WizardStudio.slug', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes(`/api/v1/public/onboarding/${TOKEN}`)) {
        return new Response(
          JSON.stringify({
            studio_name: 'מועדון בדיקה',
            logo_url: null,
            groups: [],
            slug: 'club-tel-aviv',
          }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = tokenSource(TOKEN, healthClientStub())
    const studio = await source.loadStudio()

    expect(studio.slug).toBe('club-tel-aviv')
  })

  it('loadStudio maps a missing slug to null rather than crashing (an older cached response or fixture)', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ studio_name: 'מועדון בדיקה', logo_url: null, groups: [] }),
          { status: 200 },
        ),
    )
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = tokenSource(TOKEN, healthClientStub())
    const studio = await source.loadStudio()

    expect(studio.slug).toBeNull()
  })

  // Item 4 -- door B has no session for a `/me/*` read, so `checkDuplicate` is not on
  // this source at all (`undefined`), never a function that would throw if called.
  it('has no checkDuplicate -- door B carries no /me/* session', () => {
    const source = tokenSource(TOKEN, healthClientStub())
    expect(source.checkDuplicate).toBeUndefined()
  })

  it('register posts to /api/v1/onboarding/{token}/register and rejects on a non-ok response', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ detail: 'server error' }), { status: 500 }),
    )
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = tokenSource(TOKEN, healthClientStub())

    await expect(source.register(REGISTER_PAYLOAD)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/onboarding/${TOKEN}/register`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(REGISTER_PAYLOAD),
      }),
    )
  })

  // Gap 1 -- door B used to throw a bare `Error(String(response.status))` here, discarding
  // `detail.code` entirely: a family who mistyped a ת.ז. saw "something went wrong" with no
  // way to tell which field was wrong. `tokenSource.register` now throws the same
  // `RegisterCodeError` `studioSource.register` already does, from the same wire shape.
  it("register on a 422 carrying detail.code = 'national_id_invalid' rejects with an error exposing that code", async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: { code: 'national_id_invalid' } }), {
          status: 422,
        }),
    )
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = tokenSource(TOKEN, healthClientStub())

    await expect(source.register(REGISTER_PAYLOAD)).rejects.toMatchObject({
      code: 'national_id_invalid',
    })
    await expect(source.register(REGISTER_PAYLOAD)).rejects.toBeInstanceOf(RegisterCodeError)
  })

  it('loadCatalogue maps the snake_case wire price-plan shape to WizardPlan -- pricePerMonthAgorot is the real number, not NaN', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes(`/api/v1/public/onboarding/${TOKEN}/price-plans`)) {
        return new Response(JSON.stringify({ items: [WIRE_PLAN] }), { status: 200 })
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = tokenSource(TOKEN, healthClientStub())
    const catalogue = await source.loadCatalogue()

    expect(catalogue.plans).toHaveLength(1)
    // Asserting the NUMBER, not just that it is defined -- `0` would pass a truthiness
    // check and is also wrong.
    expect(catalogue.plans[0]?.pricePerMonthAgorot).toBe(40_000)
    expect(catalogue.plans[0]?.subtitle).toBe('3 אימונים בשבוע')
  })

  it('loadCatalogue also maps a bare-array price-plans body (no `items` wrapper) the same way', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.includes(`/api/v1/public/onboarding/${TOKEN}/price-plans`)) {
        return new Response(JSON.stringify([WIRE_PLAN]), { status: 200 })
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = tokenSource(TOKEN, healthClientStub())
    const catalogue = await source.loadCatalogue()

    expect(catalogue.plans[0]?.pricePerMonthAgorot).toBe(40_000)
    expect(catalogue.plans[0]?.subtitle).toBe('3 אימונים בשבוע')
  })
})

describe('studioSource -- doors C and D, no token anywhere', () => {
  function fetchMockFor(options: {
    groupsItems?: unknown[]
    plansItems?: unknown[]
    registerStatus?: number
    registerBody?: unknown
    meStudioLogoUrl?: string | null
  } = {}) {
    const {
      groupsItems = [],
      plansItems = [],
      registerStatus = 201,
      registerBody = REGISTER_RESPONSE,
      meStudioLogoUrl = null,
    } = options
    return vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/v1/me/studio')) {
        return new Response(
          JSON.stringify({ slug: 'demo-club', name: 'מועדון בדיקה', logo_url: meStudioLogoUrl }),
          { status: 200 },
        )
      }
      if (url.includes('/api/v1/public/studios/demo-club/groups')) {
        return new Response(JSON.stringify({ items: groupsItems }), { status: 200 })
      }
      if (url.includes('/api/v1/public/studios/demo-club/price-plans')) {
        return new Response(JSON.stringify({ items: plansItems }), { status: 200 })
      }
      if (url.includes('/api/v1/me/students/register') && init?.method === 'POST') {
        return new Response(JSON.stringify(registerBody), { status: registerStatus })
      }
      return new Response(JSON.stringify({ items: [] }), { status: 200 })
    })
  }

  it('reads /api/v1/me/studio once even when both loads run, then calls /public/studios/{slug}/groups', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = fetchMockFor()
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = studioSource(healthClientStub())
    await Promise.all([source.loadStudio(), source.loadCatalogue()])

    const meStudioCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/v1/me/studio'),
    )
    expect(meStudioCalls).toHaveLength(1)
    expect(
      fetchMock.mock.calls.some(([url]) =>
        String(url).includes('/api/v1/public/studios/demo-club/groups'),
      ),
    ).toBe(true)
  })

  it("loadStudio maps training_weekdays onto the wizard group's schedule", async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = fetchMockFor({
      groupsItems: [{ id: 'g1', name: 'קבוצת בוקר', training_weekdays: [0, 2] }],
    })
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = studioSource(healthClientStub())
    const studio = await source.loadStudio()

    expect(studio.groups).toHaveLength(1)
    expect(studio.groups[0]?.id).toBe('g1')
    // `PublicGroupOut.training_weekdays` -> `WizardGroup.scheduleLabel`, the same field
    // `OnboardingGroupOut.weekdays` maps to for door B -- proving the rename was bridged,
    // not silently dropped.
    expect(studio.groups[0]?.scheduleLabel).toContain('ראשון')
  })

  it("loadStudio builds logoUrl from the PUBLIC /public/studios/{slug}/logo route, never from /me/studio's own logo_url value", async () => {
    const { apiFetch } = await import('@studio/core')
    // `/me/studio`'s `logo_url` resolves server-side to the TENANT-SCOPED
    // `/api/v1/studio/logo` -- feeding exactly that value back here proves the result is
    // not that string passed through, but the public path rebuilt from the slug.
    const fetchMock = fetchMockFor({ meStudioLogoUrl: '/api/v1/studio/logo' })
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = studioSource(healthClientStub())
    const studio = await source.loadStudio()

    expect(studio.logoUrl).toBe('https://api.test/api/v1/public/studios/demo-club/logo')
    expect(studio.logoUrl).not.toBe('/api/v1/studio/logo')
  })

  it('loadStudio returns a null logoUrl when /me/studio has no logo -- a studio with none must not get a URL that 404s', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = fetchMockFor({ meStudioLogoUrl: null })
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = studioSource(healthClientStub())
    const studio = await source.loadStudio()

    expect(studio.logoUrl).toBeNull()
  })

  // Gap 2 -- `/me/studio` carries no `club_terms_version` at all, and doors C/D have no
  // other read that would. `null` is the honest answer, not an invented number.
  it('loadStudio always returns a null clubTermsVersion -- /me/studio carries no such field', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = fetchMockFor()
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = studioSource(healthClientStub())
    const studio = await source.loadStudio()

    expect(studio.clubTermsVersion).toBeNull()
  })

  it('register posts to /api/v1/me/students/register with a body carrying club_terms_accepted and children and NO signer', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = fetchMockFor()
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = studioSource(healthClientStub())
    await source.register(REGISTER_PAYLOAD)

    const registerCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).includes('/api/v1/me/students/register') && init?.method === 'POST',
    )!
    const [, init] = registerCall
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    expect(body.club_terms_accepted).toBe(REGISTER_PAYLOAD.club_terms_accepted)
    expect(body.children).toEqual(REGISTER_PAYLOAD.children)
    expect(body).not.toHaveProperty('signer')
  })

  it("register on a 422 carrying detail.code = 'national_id_invalid' rejects with an error exposing that code", async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = fetchMockFor({
      registerStatus: 422,
      registerBody: { detail: { code: 'national_id_invalid' } },
    })
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = studioSource(healthClientStub())

    await expect(source.register(REGISTER_PAYLOAD)).rejects.toMatchObject({
      code: 'national_id_invalid',
    })
  })

  it('loadCatalogue maps the snake_case wire price-plan shape to WizardPlan -- the same contract tokenSource is held to', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = fetchMockFor({ plansItems: [WIRE_PLAN] })
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = studioSource(healthClientStub())
    const catalogue = await source.loadCatalogue()

    expect(catalogue.plans).toHaveLength(1)
    expect(catalogue.plans[0]?.pricePerMonthAgorot).toBe(40_000)
    expect(catalogue.plans[0]?.subtitle).toBe('3 אימונים בשבוע')
  })

  // Task 10 item 3 -- the same `slug` already read for the groups call, threaded through
  // onto `WizardStudio.slug` instead of discarded once the groups URL is built.
  it('loadStudio threads the slug it already reads for /me/studio onto WizardStudio.slug', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = fetchMockFor()
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = studioSource(healthClientStub())
    const studio = await source.loadStudio()

    expect(studio.slug).toBe('demo-club')
  })
})

// Task 10 item 4 -- the retired flow's duplicate warning, wired back in against the
// endpoint that never left (`GET /me/students/duplicate-check`,
// `app/routers/students.py`). Doors C/D only; `tokenSource`'s own "has no checkDuplicate"
// coverage lives in that describe block above.
describe('studioSource.checkDuplicate -- GET /me/students/duplicate-check (task 10 item 4)', () => {
  function fetchMockFor(body: unknown, status = 200) {
    return vi.fn(async (input: string | URL) => {
      if (String(input).includes('/api/v1/me/students/duplicate-check')) {
        return new Response(JSON.stringify(body), { status })
      }
      return new Response('{}', { status: 200 })
    })
  }

  it('calls the endpoint with first_name, last_name and birthdate, and resolves true on a hit', async () => {
    const { apiFetch } = await import('@studio/core')
    const fetchMock = fetchMockFor({ duplicate: true })
    vi.mocked(apiFetch).mockImplementation(fetchMock)

    const source = studioSource(healthClientStub())
    const result = await source.checkDuplicate!('נועה', 'כהן', '2016-04-01')

    expect(result).toBe(true)
    const [url] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/api/v1/me/students/duplicate-check?')
    const params = new URL(String(url), 'http://x').searchParams
    expect(params.get('first_name')).toBe('נועה')
    expect(params.get('last_name')).toBe('כהן')
    expect(params.get('birthdate')).toBe('2016-04-01')
  })

  it('resolves false on a miss -- silent, nothing to warn about', async () => {
    const { apiFetch } = await import('@studio/core')
    vi.mocked(apiFetch).mockImplementation(fetchMockFor({ duplicate: false }))

    const source = studioSource(healthClientStub())
    await expect(source.checkDuplicate!('נועה', 'כהן', '2016-04-01')).resolves.toBe(false)
  })

  it('resolves false (never rejects) on a non-OK response -- the endpoint being down must not block a registration', async () => {
    const { apiFetch } = await import('@studio/core')
    vi.mocked(apiFetch).mockImplementation(fetchMockFor({ detail: 'boom' }, 500))

    const source = studioSource(healthClientStub())
    await expect(source.checkDuplicate!('נועה', 'כהן', '2016-04-01')).resolves.toBe(false)
  })

  it('resolves false (never rejects) when the fetch itself throws', async () => {
    const { apiFetch } = await import('@studio/core')
    vi.mocked(apiFetch).mockImplementation(async () => {
      throw new Error('network down')
    })

    const source = studioSource(healthClientStub())
    await expect(source.checkDuplicate!('נועה', 'כהן', '2016-04-01')).resolves.toBe(false)
  })
})
