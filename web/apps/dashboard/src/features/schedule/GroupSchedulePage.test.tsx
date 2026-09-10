// Dashboard artboard 6a — עמוד קבוצה בודדת: רשימה + עריכת לו״ז שבועי.
//
// The page's whole job is that a manager cannot change a schedule without reading what the
// change does first. `save-rules` opens the dialog; only `confirm` writes.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { GroupSchedulePage } from './GroupSchedulePage'
import type { ImpactPreview, ScheduleClient, ScheduleRule, SessionRow } from './client'

const RULES: ScheduleRule[] = [
  {
    id: 'r1',
    group_id: 'g1',
    weekday: 2,
    start_time: '17:00:00',
    end_time: '19:00:00',
    location_id: null,
    effective_from: '2026-09-01',
  },
]

const base = {
  group_id: 'g1',
  group_name: 'מתחילים',
  class_id: 'c-judo',
  class_name: "ג'ודו",
  training_year_id: 'y1',
  location_id: null,
  location_name: null,
  cancel_reason: null,
  staff: [],
  attendance_taken: false,
}

const SESSIONS: SessionRow[] = [
  {
    ...base,
    id: 's-past',
    starts_at: '2026-10-06T15:00:00Z',
    ends_at: '2026-10-06T17:00:00Z',
    status: 'completed',
    is_manually_edited: false,
    is_ad_hoc: false,
  },
  {
    ...base,
    id: 's-edited',
    starts_at: '2026-11-17T16:30:00Z',
    ends_at: '2026-11-17T18:30:00Z',
    status: 'scheduled',
    is_manually_edited: true,
    is_ad_hoc: false,
  },
  {
    ...base,
    id: 's-adhoc',
    starts_at: '2026-12-11T08:00:00Z',
    ends_at: '2026-12-11T10:00:00Z',
    status: 'scheduled',
    is_manually_edited: true,
    is_ad_hoc: true,
  },
  {
    ...base,
    id: 's-cancelled',
    starts_at: '2026-12-15T15:00:00Z',
    ends_at: '2026-12-15T17:00:00Z',
    status: 'cancelled',
    is_manually_edited: false,
    is_ad_hoc: false,
    cancel_reason: 'system:closure',
  },
]

const PREVIEW: ImpactPreview = {
  sessions_to_create: 0,
  sessions_to_update: 32,
  sessions_to_cancel: 0,
  sessions_protected_past: 18,
  sessions_protected_manually_edited: 1,
  sessions_protected_ad_hoc: 1,
  first_affected_date: '2026-11-17',
  protected_manually_edited_sessions: [
    { id: 's-edited', starts_at: '2026-11-17T16:30:00Z', ends_at: '2026-11-17T18:30:00Z' },
  ],
  students_left_unscheduled: 0,
}

function stubClient(overrides: Partial<ScheduleClient> = {}): ScheduleClient {
  return {
    listGroups: vi.fn(async () => [{ id: 'g1', name: 'מתחילים', className: "ג'ודו", classId: 'c1', isActive: true }]),
    listSessions: vi.fn(async () => SESSIONS),
    getSchedule: vi.fn(async () => RULES),
    putSchedule: vi.fn(async () => PREVIEW),
    listTrainingYears: vi.fn(async () => [
      {
        id: 'y1',
        name: 'תשפ״ז',
        starts_on: '2026-09-01',
        ends_on: '2027-06-30',
        status: 'active' as const,
      },
    ]),
    listClosures: vi.fn(async () => []),
    createClosure: vi.fn(async () => ({ sessions_cancelled: 0 })),
    listHolidayPresets: vi.fn(async () => []),
    createSession: vi.fn(async () => {
      throw new Error('not in this test')
    }),
    patchSession: vi.fn(async () => {
      throw new Error('not in this test')
    }),
    cancelSession: vi.fn(async () => {
      throw new Error('not in this test')
    }),
    addSessionNote: vi.fn(async () => undefined),
    deleteSession: vi.fn(async () => undefined),
    listLocations: vi.fn(async () => []),
    ...overrides,
  }
}

function renderPage(client = stubClient(), locale: Locale = 'he') {
  render(
    <GroupSchedulePage locale={locale} groupId="g1" groupName="מתחילים" client={client} />,
  )
  return client
}

describe('GroupSchedulePage (6a)', () => {
  it('renders the weekly rules the group already has', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    expect(screen.getAllByTestId('rule-row')).toHaveLength(1)
    expect(screen.getByTestId('start-time')).toHaveValue('17:00')
  })

  it('renders a session row per session, in the studio timezone', async () => {
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(4))
    // 16:30Z on 17 November is 18:30 in Jerusalem — winter, UTC+2.
    expect(screen.getAllByTestId('session-time')[1]).toHaveTextContent('18:30')
  })

  it('marks the sessions a rule change will not touch', async () => {
    // E2E-5 filters rows on exactly these labels.
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(4))
    expect(screen.getByText(t('he', 'schedule.session.manuallyEdited'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.session.adHoc'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.session.status.completed'))).toBeInTheDocument()
  })

  it('does not label an ad-hoc session as merely manually edited', async () => {
    // Both flags are true on an ad-hoc row (the service sets both), and showing both reads
    // as two separate facts about one lesson.
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(4))
    expect(screen.getAllByText(t('he', 'schedule.session.manuallyEdited'))).toHaveLength(1)
  })

  it('translates a system cancellation reason rather than printing the token', async () => {
    // D-M2-3 — the server writes `system:closure`; a human never sees that string.
    renderPage()
    await waitFor(() => expect(screen.getAllByTestId('session-row')).toHaveLength(4))
    expect(screen.getByText(t('he', 'schedule.session.cancelReason.closure'))).toBeInTheDocument()
    expect(screen.queryByText('system:closure')).toBeNull()
  })

  it('previews before it applies — saving opens the dialog and writes nothing', async () => {
    const client = renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('save-rules'))

    await waitFor(() => expect(screen.getByTestId('impact-preview')).toBeInTheDocument())
    expect(client.putSchedule).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ apply: false }),
    )
  })

  it('applies only after the manager confirms', async () => {
    const client = renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('save-rules'))
    await waitFor(() => expect(screen.getByTestId('impact-preview')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('confirm'))
    await waitFor(() =>
      expect(client.putSchedule).toHaveBeenLastCalledWith(
        'g1',
        expect.objectContaining({ apply: true }),
      ),
    )
  })

  it('cancelling the dialog changes nothing', async () => {
    const client = renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('save-rules'))
    await waitFor(() => expect(screen.getByTestId('impact-preview')).toBeInTheDocument())

    await userEvent.click(screen.getByTestId('impact-cancel'))
    await waitFor(() => expect(screen.queryByTestId('impact-preview')).toBeNull())
    expect(client.putSchedule).toHaveBeenCalledTimes(1)
    expect(client.putSchedule).not.toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({ apply: true }),
    )
  })

  it('sends the edited time, in the naive local form the rule column stores', async () => {
    // group_schedule_rule carries a naive Time, not an instant: a 17:00 class is 17:00 in
    // November and 17:00 in June. Sending an instant here would bake in one offset.
    const client = renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    await userEvent.clear(screen.getByTestId('start-time'))
    await userEvent.type(screen.getByTestId('start-time'), '18:00')
    await userEvent.click(screen.getByTestId('save-rules'))

    await waitFor(() => expect(client.putSchedule).toHaveBeenCalled())
    expect(client.putSchedule).toHaveBeenCalledWith(
      'g1',
      expect.objectContaining({
        rules: [expect.objectContaining({ start_time: '18:00:00' })],
      }),
    )
  })

  it('adds and removes a rule row', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    await userEvent.click(screen.getByTestId('add-rule'))
    expect(screen.getAllByTestId('rule-row')).toHaveLength(2)

    // `noUncheckedIndexedAccess` makes an indexed lookup `HTMLElement | undefined`, and a
    // `!` here would be the one place in the file where a wrong length fails as a null
    // dereference instead of as a readable assertion.
    const [, secondRemove] = screen.getAllByTestId('remove-rule')
    expect(secondRemove).toBeDefined()
    await userEvent.click(secondRemove as HTMLElement)
    expect(screen.getAllByTestId('rule-row')).toHaveLength(1)
  })

  it('refuses a rule whose end is not after its start, before asking the server', async () => {
    const client = renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    await userEvent.clear(screen.getByTestId('end-time'))
    await userEvent.type(screen.getByTestId('end-time'), '16:00')
    await userEvent.click(screen.getByTestId('save-rules'))

    expect(await screen.findByText(t('he', 'schedule.rules.endBeforeStart'))).toBeInTheDocument()
    expect(client.putSchedule).not.toHaveBeenCalled()
  })

  it('says so when the studio has no active training year', async () => {
    renderPage(stubClient({ listTrainingYears: vi.fn(async () => []) }))
    expect(await screen.findByText(t('he', 'schedule.group.noActiveYear'))).toBeInTheDocument()
  })

  it('says the group has no schedule rather than showing an empty table', async () => {
    renderPage(
      stubClient({ getSchedule: vi.fn(async () => []), listSessions: vi.fn(async () => []) }),
    )
    expect(await screen.findByText(t('he', 'schedule.rules.empty'))).toBeInTheDocument()
  })

  it('every control has an accessible name', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByTestId('weekly-rules')).toBeInTheDocument())
    for (const control of [
      ...screen.getAllByRole('combobox'),
      ...screen.getAllByRole('button'),
    ]) {
      expect(control).toHaveAccessibleName()
    }
    expect(screen.getByTestId('start-time')).toHaveAccessibleName()
    expect(screen.getByTestId('end-time')).toHaveAccessibleName()
  })

  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    const { container } = render(
      <GroupSchedulePage
        locale={locale}
        groupId="g1"
        groupName="מתחילים"
        client={stubClient()}
      />,
    )
    await waitFor(() => expect(screen.getAllByTestId('weekly-rules').length).toBeGreaterThan(0))
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})

// Checkpoint 7. `putSchedule` had a `try/finally` and no `catch` on both paths, so a
// rejected call cleared `busy` and did nothing else — on the one screen whose whole job is
// "read what the change does before it happens", silence is the worst available answer.
describe('a failed schedule call says so', () => {
  it('reports a failed preview instead of a button that does nothing', async () => {
    const client = stubClient({
      putSchedule: vi.fn(async () => {
        throw new Error('500')
      }),
    })
    render(<GroupSchedulePage client={client} groupId="g1" groupName="מתחילים" locale="he" />)
    await waitFor(() => expect(screen.getAllByTestId('rule-row').length).toBeGreaterThan(0))
    await userEvent.click(screen.getByTestId('save-rules'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('he', 'schedule.group.previewFailed'),
    )
    // And no dialog: the manager must not be shown an impact that was never computed.
    expect(screen.queryByTestId('impact-preview')).not.toBeInTheDocument()
    // The button comes back — `finally` still clears `busy`, and a permanently disabled
    // button after one failure would be a second dead end on top of the first.
    expect(screen.getByTestId('save-rules')).not.toBeDisabled()
  })

  it('closes the dialog and reports a failed apply, rather than inviting a blind retry', async () => {
    let calls = 0
    const client = stubClient({
      putSchedule: vi.fn(async (_groupId: string, body: { apply?: boolean }) => {
        calls += 1
        if (body.apply) throw new Error('500')
        return PREVIEW
      }),
    })
    render(<GroupSchedulePage client={client} groupId="g1" groupName="מתחילים" locale="he" />)
    await waitFor(() => expect(screen.getAllByTestId('rule-row').length).toBeGreaterThan(0))
    await userEvent.click(screen.getByTestId('save-rules'))
    await screen.findByTestId('impact-preview')
    await userEvent.click(screen.getByTestId('confirm'))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      t('he', 'schedule.group.applyFailed'),
    )
    // A partially-applied rewrite of a year is not something to retry blind. The dialog
    // closes so the next attempt starts by re-reading the impact.
    await waitFor(() => expect(screen.queryByTestId('impact-preview')).not.toBeInTheDocument())
    expect(calls).toBe(2)
  })
})
