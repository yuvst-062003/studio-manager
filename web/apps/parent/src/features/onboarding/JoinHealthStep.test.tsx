import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { makeHealthClient } from '../health/healthClient'
import type { Fetcher, HealthClient } from '../health/healthClient'
import type { GatedStudent } from '../health/HealthGate'
import { JoinHealthStep } from './JoinHealthStep'

const schema = {
  sections: [
    {
      id: 'medical_history',
      title: 'רקע רפואי',
      questions: [{ id: 'asthma', type: 'boolean' as const, label: 'אסתמה', flag: true }],
    },
    {
      id: 'other',
      title: 'נוסף',
      questions: [
        { id: 'health_fund', type: 'text' as const, label: 'קופת חולים', required: false },
        {
          id: 'emergency_contact',
          type: 'phone' as const,
          label: 'טלפון חירום',
          required: true,
        },
      ],
    },
    {
      id: 'declaration',
      title: 'הצהרה',
      questions: [
        { id: 'special_notes', type: 'text' as const, label: 'הערות', required: false },
        {
          id: 'clause_confirmed',
          type: 'clause' as const,
          label: 'אני מאשר/ת',
          required: true,
        },
      ],
    },
  ],
}

function makeClient(): HealthClient {
  return {
    template: vi.fn(async () => ({ id: 'tmpl1', version: 1, schema })),
    submit: vi.fn(async () => ({}) as never),
  } as unknown as HealthClient
}

/** F14: a variant of `schema` with `health_fund` flipped to required, matching
 *  `app/services/structure/health_templates.py` post-fix rather than this file's own
 *  baseline fixture (left `required: false` above so the OTHER tests keep proving the
 *  general "optional fields are optional" shape, undisturbed by this one). */
function makeClientRequiringHealthFund(): HealthClient {
  const requiredHealthFundSchema = {
    ...schema,
    sections: schema.sections.map((section) =>
      section.id === 'other'
        ? {
            ...section,
            questions: section.questions.map((question) =>
              question.id === 'health_fund' ? { ...question, required: true } : question,
            ),
          }
        : section,
    ),
  }
  return {
    template: vi.fn(async () => ({ id: 'tmpl1', version: 1, schema: requiredHealthFundSchema })),
    submit: vi.fn(async () => ({}) as never),
  } as unknown as HealthClient
}

const students: readonly GatedStudent[] = [
  { id: 'st1', display_name: 'דנה כהן', health_status: 'missing' },
  { id: 'st2', display_name: 'יוסי כהן', health_status: 'missing' },
]

beforeEach(() => {
  const strokes: { x: number; y: number }[] = []
  ;(globalThis as unknown as { __strokes: typeof strokes }).__strokes = strokes
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    font: '',
    textAlign: '',
    textBaseline: '',
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,AAAA')
})

/** Decision 13: the typed-name fallback is gone -- drawing is the only way to sign. Fires a
 *  real pointer path on the canvas rather than typing into a field that no longer exists.
 *  `fireEvent`, not a raw `dispatchEvent`: each call is wrapped in `act()`, so the pad's
 *  `hasInk` state has actually flushed by the time the next event fires. Firing all three
 *  natively in one synchronous block leaves `pointerup`'s handler closed over the
 *  pre-update `hasInk`, and the draw never emits a signature. */
function signByDrawing() {
  const canvas = screen.getByTestId('signature-canvas')
  fireEvent.pointerDown(canvas, { clientX: 100, clientY: 100, pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
  fireEvent.pointerUp(canvas, { clientX: 200, clientY: 100, pointerId: 1 })
}

async function signCurrentKid(user: ReturnType<typeof userEvent.setup>) {
  signByDrawing()
  await user.type(screen.getByLabelText('טלפון חירום'), '0501234567')
  await user.click(screen.getByRole('checkbox', { name: /אני מאשר/ }))
}

describe('JoinHealthStep (2-inner-step, deferred)', () => {
  it('shows the opening question first, with nothing else on screen', async () => {
    const client = makeClient()
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={vi.fn()}
        students={students}
      />,
    )
    await screen.findByTestId('health-opening-question')
    expect(screen.queryByTestId('signature-canvas')).toBeNull()
  })

  it('the healthy path shows a collapsed card, not the full form, until "open" is pressed', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={vi.fn()}
        students={students}
      />,
    )
    await user.click(await screen.findByTestId('health-opening-healthy'))
    await screen.findByTestId('health-collapsed-card')
    expect(screen.queryByTestId('health-review-popup')).toBeNull()
    await user.click(screen.getByTestId('health-review-open'))
    await screen.findByTestId('health-review-popup')
  })

  it('never calls client.submit while the queue is in progress', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={vi.fn()}
        students={students}
      />,
    )
    await user.click(await screen.findByTestId('health-opening-healthy'))
    await signCurrentKid(user)
    await user.click(screen.getByTestId('health-sign-continue'))
    expect(client.submit).not.toHaveBeenCalled()
  })

  it('advances to the next kid on sign and hands the caller the finished draft', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    const onSigned = vi.fn()
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={onSigned}
        students={students}
      />,
    )
    await user.click(await screen.findByTestId('health-opening-healthy'))
    await signCurrentKid(user)
    await user.click(screen.getByTestId('health-sign-continue'))

    await waitFor(() => expect(onSigned).toHaveBeenCalledTimes(1))
    expect(onSigned.mock.calls[0]?.[0]).toMatchObject({
      studentId: 'st1',
      templateId: 'tmpl1',
      openingAnswer: 'healthy',
      signatureBase64: 'data:image/png;base64,AAAA',
    })
  })

  it('the something-to-report path shows the full form expanded, no collapsed card', async () => {
    const user = userEvent.setup()
    const client = makeClient()
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={vi.fn()}
        students={students}
      />,
    )
    await user.click(await screen.findByTestId('health-opening-reporting'))
    await screen.findByTestId('health-review-popup')
    expect(screen.queryByTestId('health-collapsed-card')).toBeNull()
  })

  it('cannot sign the "nothing wrong" clause once a concern is flagged, without re-confirming', async () => {
    // §4 step 3 item 5: "the declaration sentence -- derived from the answers, never
    // chosen". A parent who ticks the confirmation while everything reads "no", then opens
    // the review and flags a concern, is left holding a STALE "none" confirmation next to
    // answers that now imply "limited". `sign()` must refuse that draft -- the server would
    // otherwise be the first thing to catch it, as `clause_mismatch`.
    const user = userEvent.setup()
    const client = makeClient()
    const onSigned = vi.fn()
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={onSigned}
        students={students}
      />,
    )
    await user.click(await screen.findByTestId('health-opening-healthy'))
    await screen.findByTestId('health-collapsed-card')

    // Confirm "nothing wrong" while every answer is still false.
    await user.click(screen.getByRole('checkbox', { name: /אני מאשר/ }))

    // Now open the review and flag a concern.
    await user.click(screen.getByTestId('health-review-open'))
    await screen.findByTestId('health-review-popup')
    await user.click(screen.getByRole('radio', { name: t('he', 'health.declaration.yes') }))

    // The checkbox must have unticked itself -- the confirmed clause no longer matches.
    expect(screen.getByRole('checkbox', { name: /אני מאשר/ })).not.toBeChecked()

    await user.type(screen.getByLabelText('טלפון חירום'), '0501234567')
    signByDrawing()
    await user.click(screen.getByTestId('health-sign-continue'))

    expect(onSigned).not.toHaveBeenCalled()
  })

  it('F14: blocks signing and shows an inline error when health_fund is required and left blank', async () => {
    const user = userEvent.setup()
    const client = makeClientRequiringHealthFund()
    const onSigned = vi.fn()
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={onSigned}
        students={students}
      />,
    )
    await user.click(await screen.findByTestId('health-opening-healthy'))
    // Every other required field filled, health_fund left blank on purpose.
    await user.type(screen.getByLabelText('טלפון חירום'), '0501234567')
    signByDrawing()
    await user.click(screen.getByRole('checkbox', { name: /אני מאשר/ }))
    await user.click(screen.getByTestId('health-sign-continue'))

    expect(onSigned).not.toHaveBeenCalled()
    expect(screen.getByLabelText('קופת חולים')).toHaveAccessibleDescription(
      t('he', 'people.join.required'),
    )
  })

  it('F14: signs once health_fund is filled', async () => {
    const user = userEvent.setup()
    const client = makeClientRequiringHealthFund()
    const onSigned = vi.fn()
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={onSigned}
        students={students}
      />,
    )
    await user.click(await screen.findByTestId('health-opening-healthy'))
    await user.type(screen.getByLabelText('קופת חולים'), 'מכבי')
    await user.type(screen.getByLabelText('טלפון חירום'), '0501234567')
    signByDrawing()
    await user.click(screen.getByRole('checkbox', { name: /אני מאשר/ }))
    await user.click(screen.getByTestId('health-sign-continue'))

    await waitFor(() => expect(onSigned).toHaveBeenCalledTimes(1))
  })
})

// Decision 7: "the short trial template is retired ... a trial family stops filling a
// health form twice." Testing the SEAM rather than a hand-built mock: `SubjectHealthFlow`
// calls `client.template()`, and every OTHER test in this file stubs that call away with
// `makeClient()` above -- which proves nothing about what the REAL client, wired to a real
// fetcher, actually asks the server for. This exercises `makeHealthClient` (the module
// `JoinHealthStep` is handed in production, unlike the mock everywhere else in this file)
// against a recording fetcher, so a change that made the wizard's health step fetch
// `kind=trial` -- or drop the query param and take `items[0]` of whatever the server
// returns -- would show up here rather than passing silently forever.
describe('the wizard health step, wired to the real client', () => {
  function recordingFetcher(schema: unknown) {
    const urls: string[] = []
    const fetcher: Fetcher = vi.fn(async (path) => {
      urls.push(path)
      if (path === '/api/v1/health-templates?kind=full') {
        return new Response(JSON.stringify({ items: [{ id: 'tmpl-real', version: 2 }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (path === '/api/v1/health-templates/tmpl-real') {
        return new Response(JSON.stringify({ id: 'tmpl-real', version: 2, schema }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      throw new Error(`unexpected fetch in this test: ${path}`)
    })
    return { urls, fetcher }
  }

  it('only ever asks the server for kind=full, never kind=trial', async () => {
    const { urls, fetcher } = recordingFetcher(schema)
    const client = makeHealthClient(fetcher)
    render(
      <JoinHealthStep
        client={client}
        drafts={{}}
        locale="he"
        onBack={vi.fn()}
        onSigned={vi.fn()}
        students={students}
      />,
    )
    await screen.findByTestId('health-opening-question')
    expect(urls).toContain('/api/v1/health-templates?kind=full')
    expect(urls.some((url) => url.includes('trial'))).toBe(false)
  })
})
