// Task 3a's own seam: `tokenSource` is lifted unchanged from `WizardJoinFlow` (door B's
// three request shapes), and `studioSource` is new (doors C/D). `apiFetch` is mocked;
// nothing here renders a screen.
import { describe, expect, it, vi } from 'vitest'
import type { HealthClient } from '../../health/healthClient'
import type { RegisterPayload } from './adapters'
import type { RegisterResult } from './submitJoin'
import { studioSource, tokenSource } from './wizardSources'

vi.mock('@studio/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@studio/core')>()
  return {
    ...actual,
    apiFetch: vi.fn(),
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
      price_plan_id: 'plan-1',
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
})

describe('studioSource -- doors C and D, no token anywhere', () => {
  function fetchMockFor(options: {
    groupsItems?: unknown[]
    plansItems?: unknown[]
    registerStatus?: number
    registerBody?: unknown
  } = {}) {
    const {
      groupsItems = [],
      plansItems = [],
      registerStatus = 201,
      registerBody = REGISTER_RESPONSE,
    } = options
    return vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/v1/me/studio')) {
        return new Response(
          JSON.stringify({ slug: 'demo-club', name: 'מועדון בדיקה', logo_url: null }),
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
})
