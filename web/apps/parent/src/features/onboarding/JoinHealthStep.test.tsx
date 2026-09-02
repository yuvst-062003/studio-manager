import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { HealthClient } from '../health/healthClient'
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

async function signCurrentKid(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByLabelText(t('he', 'health.declaration.signatureTyped')),
    'דנה כהן',
  )
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
})
