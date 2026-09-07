// Artboards 9i (אירועים בצוות) and 9d (מבחן חגורה), the staff app's two events screens.
//
// **9d finding 1 is the whole of frame 2.** The artboard's candidate rows carry no pointer
// and no handler — it is a static picture of already-computed results, so it shows the
// destination and not the mechanism. Tap-to-cycle is the natural interaction and the one
// 1c and 9f already use for attendance, and it is not drawn anywhere. It is built here.
//
// **9d finding 3 — do NOT reuse `AttendanceMark`.** Structurally identical (filled check,
// filled cross, dashed dot) and semantically a different domain: `AttendanceState` is
// present | absent | notified | unmarked, and an exam result is pass | fail | pending.
// Reusing the attendance-named component would make an exam result a kind of attendance.
//
// **9i finding 7 is a KEEPER.** Its three RSVP renderings are state-appropriate rather
// than inconsistent, unlike 12h's three. Written down as a test so nobody later "unifies"
// them into one bar that reads as 0% before anyone has been asked.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listPending,
  memoryStore,
  queueChanged,
  setForcedMode,
  setOfflineStore,
} from '@studio/core'
import type { OfflineStore } from '@studio/core'
import { t } from '@studio/i18n'
import { ExamResultsScreen } from './ExamResultsScreen'
import { StaffEventsScreen } from './StaffEventsScreen'
import type { CandidateOut, EventOut, StaffEventsClient } from './client'

const WHITE = {
  id: 'r1',
  class_id: 'c1',
  name: 'לבנה',
  kyu: 6,
  order_index: 0,
  color_hex: '#FFFFFF',
  secondary_color_hex: null,
}
const YELLOW = {
  id: 'r2',
  class_id: 'c1',
  name: 'צהובה',
  kyu: 5,
  order_index: 1,
  color_hex: '#F7E017',
  secondary_color_hex: null,
}

const EXAM: EventOut = {
  id: 'e1',
  type: 'belt_exam',
  title: 'מבחן סתיו',
  description: null,
  starts_at: '2026-11-26T15:00:00Z',
  ends_at: '2026-11-26T17:00:00Z',
  location_id: null,
  location_text: 'אולם א׳',
  rsvp_deadline: null,
  fee_agorot: null,
  requires_consent: false,
  consent_text: null,
  status: 'published',
  targets: [],
  rsvp_yes_count: 0,
  rsvp_no_count: 0,
  rsvp_pending_count: 2,
  consent_signed_count: 0,
}

const CANDIDATES: CandidateOut[] = [
  {
    student_id: 's1',
    student_display_name: 'דנה לוי',
    current_rank: WHITE,
    next_rank: YELLOW,
    months_at_rank: 5,
    eligible: true,
  },
  {
    student_id: 's2',
    student_display_name: 'איתי כהן',
    current_rank: YELLOW,
    next_rank: null,
    months_at_rank: 9,
    eligible: false,
  },
]

function makeClient(over: Partial<StaffEventsClient> = {}): StaffEventsClient {
  return {
    list: vi.fn().mockResolvedValue({ items: [], next_cursor: null, has_more: false }),
    read: vi.fn().mockResolvedValue(EXAM),
    eligibility: vi
      .fn()
      .mockResolvedValue({ items: CANDIDATES, next_cursor: null, has_more: false }),
    recordResults: vi
      .fn()
      .mockResolvedValue({ items: [], next_cursor: null, has_more: false }),
    ...over,
  } as unknown as StaffEventsClient
}

function renderResults(client = makeClient()) {
  render(<ExamResultsScreen client={client} eventId="e1" locale="he" />)
  return client
}

describe('9d — recording exam results', () => {
  it('cycles a candidate pass → fail → not marked on tap', async () => {
    // 9d finding 1 — the artboard shows the outcome and not the interaction.
    renderResults()
    const row = await screen.findByRole('button', { name: /דנה לוי/ })
    // The row holds three `img` roles -- the mark and two belt bars -- so the mark is
    // addressed by its own class, the same handle the never-AttendanceMark test uses.
    const mark = () => row.querySelector('.studio-exam-mark')
    expect(mark()).toHaveAttribute('data-result', 'pending')
    await userEvent.click(row)
    expect(mark()).toHaveAttribute('data-result', 'pass')
    await userEvent.click(row)
    expect(mark()).toHaveAttribute('data-result', 'fail')
    await userEvent.click(row)
    expect(mark()).toHaveAttribute('data-result', 'pending')
  })

  it('uses ExamResultMark and never AttendanceMark', async () => {
    const { container } = render(
      <ExamResultsScreen client={makeClient()} eventId="e1" locale="he" />,
    )
    await screen.findByRole('button', { name: /דנה לוי/ })
    expect(container.querySelector('.studio-attendance')).toBeNull()
    expect(container.querySelector('.studio-exam-mark')).not.toBeNull()
  })

  it('shows two swatches on a pass and one on a candidate who cannot advance', async () => {
    // The best thing on 9d: the belt visual is STRUCTURALLY different rather than
    // annotated, so "no change" is shown instead of said.
    renderResults()
    const dana = await screen.findByRole('button', { name: /דנה לוי/ })
    expect(within(dana).getAllByRole('img').filter((el) => el.classList.contains('studio-belt-bar'))).toHaveLength(2)
    const itai = screen.getByRole('button', { name: /איתי כהן/ })
    expect(within(itai).getAllByRole('img').filter((el) => el.classList.contains('studio-belt-bar'))).toHaveLength(1)
  })

  it('scopes the consequence to a pass, and confirms before saving', async () => {
    // 9d finding 4 — events.exam.passPromotesHint is better than the drawn caption: it
    // scopes the consequence to a PASS and names the promotion. Ship the key, and add the
    // confirmation an effectively irreversible write needs.
    renderResults()
    const row = await screen.findByRole('button', { name: /דנה לוי/ })
    await userEvent.click(row)
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.save') }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent(t('he', 'events.exam.passPromotesHint'))
  })

  it('sends every marked candidate in ONE call', async () => {
    // §5.9 step 3 is one transaction. A per-row call would leave a half-promoted roster.
    const client = renderResults()
    await userEvent.click(await screen.findByRole('button', { name: /דנה לוי/ }))
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.save') }))
    await userEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: t('he', 'events.exam.save'),
      }),
    )
    expect(client.recordResults).toHaveBeenCalledTimes(1)
    expect(client.recordResults).toHaveBeenCalledWith('e1', [
      { student_id: 's1', belt_rank_id: 'r2', result: 'pass', note: null },
    ])
  })

  it('sends nothing for a candidate left unmarked', async () => {
    const client = renderResults()
    await screen.findByRole('button', { name: /דנה לוי/ })
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.save') }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(client.recordResults).not.toHaveBeenCalled()
  })

  it('offers no makeup date, because a makeup sitting has no model', async () => {
    // 9d finding 2 — two places on the artboard depend on one, and §5.9 has no column.
    renderResults()
    await screen.findByRole('button', { name: /דנה לוי/ })
    expect(screen.queryByText(/מועד השלמה/)).toBeNull()
  })

  it('never says a parent will be notified, because nothing notifies yet', async () => {
    // §5.9 step 4 is M8's. events.exam.passPromotesHint deliberately says nothing about it,
    // which the artboard audit had already noticed about the drawn caption.
    renderResults()
    await screen.findByRole('button', { name: /דנה לוי/ })
    expect(screen.queryByText(/הודעה|יקבלו/)).toBeNull()
  })
})

describe('9i — the staff events list', () => {
  function renderList(rows: EventOut[]) {
    const client = makeClient({
      list: vi.fn().mockResolvedValue({ items: rows, next_cursor: null, has_more: false }),
    })
    render(
      <StaffEventsScreen
        client={client}
        locale="he"
        now="2026-11-12T09:00:00Z"
        onOpen={vi.fn()}
      />,
    )
    return client
  }

  it('carries date, time and venue on every card (S9)', async () => {
    renderList([EXAM])
    const when = await screen.findByTestId('event-when')
    // 15:00Z on 26 November is 17:00 in Jerusalem.
    expect(when).toHaveTextContent('17:00')
    expect(when).toHaveTextContent('אולם א׳')
  })

  it('counts the upcoming in the header (S9)', async () => {
    renderList([
      EXAM, // 26 Nov — ahead of the fixed now (12 Nov)
      { ...EXAM, id: 'e0', starts_at: '2026-11-01T15:00:00Z', ends_at: '2026-11-01T17:00:00Z' },
    ])
    expect(await screen.findByTestId('events-upcoming')).toHaveTextContent(
      `1 ${t('he', 'events.list.upcoming')}`,
    )
  })

  it('states the consent position, and celebrates only a full set (S9)', async () => {
    renderList([
      {
        ...EXAM,
        requires_consent: true,
        rsvp_yes_count: 2,
        rsvp_pending_count: 1,
        consent_signed_count: 2,
      },
    ])
    const consents = await screen.findByTestId('event-consents')
    expect(consents).toHaveTextContent('אישורים: 2/3')
  })

  it('says all consents are signed when they are (S9)', async () => {
    renderList([
      {
        ...EXAM,
        requires_consent: true,
        rsvp_yes_count: 3,
        rsvp_pending_count: 0,
        consent_signed_count: 3,
      },
    ])
    expect(await screen.findByTestId('event-consents')).toHaveTextContent(
      t('he', 'events.consent.allSigned'),
    )
  })

  it('names a draft s unsent invitations, and שליחה publishes (S9)', async () => {
    const client = makeClient({
      list: vi
        .fn()
        .mockResolvedValue({ items: [{ ...EXAM, status: 'draft' }], next_cursor: null, has_more: false }),
      publish: vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
    })
    render(
      <StaffEventsScreen
        canPublish
        client={client}
        locale="he"
        now="2026-11-12T09:00:00Z"
        onOpen={vi.fn()}
      />,
    )
    expect(await screen.findByTestId('event-draft')).toBeInTheDocument()
    await userEvent.click(screen.getByTestId('event-send'))
    expect(client.publish).toHaveBeenCalledWith('e1')
  })

  it('offers an assistant coach no send button the server would refuse (S9)', async () => {
    renderList([{ ...EXAM, status: 'draft' }])
    await screen.findByTestId('event-draft')
    expect(screen.queryByTestId('event-send')).toBeNull()
  })

  it('routes a future event to the participants list, a held exam to the sheet (S9)', async () => {
    const onOpen = vi.fn()
    const onOpenRoster = vi.fn()
    const client = makeClient({
      list: vi.fn().mockResolvedValue({
        items: [
          EXAM,
          { ...EXAM, id: 'e0', starts_at: '2026-11-01T15:00:00Z', ends_at: '2026-11-01T17:00:00Z' },
        ],
        next_cursor: null,
        has_more: false,
      }),
    })
    render(
      <StaffEventsScreen
        client={client}
        locale="he"
        now="2026-11-12T09:00:00Z"
        onOpen={onOpen}
        onOpenRoster={onOpenRoster}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: t('he', 'events.roster.title') }))
    expect(onOpenRoster).toHaveBeenCalledWith('e1')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.exam.record') }))
    expect(onOpen).toHaveBeenCalledWith('e0')
  })

  it('keeps three state-appropriate RSVP renderings', async () => {
    // 9i finding 7 — unlike 12h's three, these are correct BECAUSE they differ. Recorded so
    // nobody unifies them into one bar that reads 0% before anyone has been asked.
    renderList([
      { ...EXAM, id: 'a', title: 'טרם נשלח', rsvp_yes_count: 0, rsvp_no_count: 0, rsvp_pending_count: 0 },
      { ...EXAM, id: 'b', title: 'בתהליך', rsvp_yes_count: 12, rsvp_no_count: 2, rsvp_pending_count: 8 },
      { ...EXAM, id: 'c', title: 'הושלם', rsvp_yes_count: 20, rsvp_no_count: 2, rsvp_pending_count: 0 },
    ])
    // Nobody invited: a headcount, and no bar to read as zero per cent.
    const notSent = await screen.findByRole('article', { name: 'טרם נשלח' })
    expect(within(notSent).queryByRole('progressbar')).toBeNull()
    // In progress: a bar and a fraction.
    const inProgress = screen.getByRole('article', { name: 'בתהליך' })
    expect(within(inProgress).getByRole('progressbar')).toBeInTheDocument()
    // Everyone answered: no outstanding count to chase.
    const done = screen.getByRole('article', { name: 'הושלם' })
    expect(within(done).queryByText(new RegExp(t('he', 'events.counts.pending')))).toBeNull()
  })

  it('shows a coach no fee anywhere', async () => {
    // §3.2's hard rule. The API redacts it; this asserts the screen does not reintroduce it.
    renderList([{ ...EXAM, fee_agorot: null, title: 'תחרות' }])
    await screen.findByRole('article', { name: 'תחרות' })
    expect(screen.queryByText(/₪/)).toBeNull()
    expect(screen.queryByText(t('he', 'events.fee.free'))).toBeNull()
  })

  it('renders the empty state a coach with no events is in', async () => {
    renderList([])
    expect(await screen.findByText(t('he', 'events.list.empty'))).toBeInTheDocument()
  })
})


describe('9i — the participants list', () => {
  const ROWS = [
    {
      id: 'reg1',
      event_id: 'e1',
      student_id: 'st1',
      student_display_name: 'דנה כהן',
      rsvp: 'yes',
      responded_by_person_id: null,
      responded_at: '2026-11-10T10:00:00Z',
      consent_signed_at: '2026-11-10T10:00:00Z',
      charge_id: null,
      attended: null,
    },
    {
      id: 'reg2',
      event_id: 'e1',
      student_id: 'st2',
      student_display_name: 'רון לוי',
      rsvp: 'pending',
      responded_by_person_id: null,
      responded_at: null,
      consent_signed_at: null,
      charge_id: null,
      attended: null,
    },
  ]

  it('lists who answered what, and where each consent stands', async () => {
    const { EventRosterScreen } = await import('./EventRosterScreen')
    const client = makeClient({
      read: vi.fn().mockResolvedValue({ ...EXAM, requires_consent: true }),
      registrations: vi.fn().mockResolvedValue({ items: ROWS, next_cursor: null, has_more: false }),
    })
    render(<EventRosterScreen client={client} eventId="e1" locale="he" />)
    const rows = await screen.findAllByTestId('event-roster-row')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent(t('he', 'events.rsvp.yes'))
    expect(rows[0]).toHaveTextContent(t('he', 'events.consent.signed'))
    expect(rows[1]).toHaveTextContent(t('he', 'events.rsvp.pending'))
    expect(rows[1]).toHaveTextContent(t('he', 'events.consent.pending'))
  })

  it('shows no consent chip when the event asks for none', async () => {
    const { EventRosterScreen } = await import('./EventRosterScreen')
    const client = makeClient({
      read: vi.fn().mockResolvedValue(EXAM),
      registrations: vi
        .fn()
        .mockResolvedValue({ items: [ROWS[0]], next_cursor: null, has_more: false }),
    })
    render(<EventRosterScreen client={client} eventId="e1" locale="he" />)
    const row = await screen.findByTestId('event-roster-row')
    expect(row).not.toHaveTextContent(t('he', 'events.consent.signed'))
  })

  // The gap this wave closed: the endpoint's own docstring already claimed "attendance is
  // taken on an event with the same UI as a session" and "every staff role", and this
  // screen offered no way to mark anyone.
  //
  // **Checkpoint 13 (2026-09-07) — §6.5, decision 14** made the mark itself queue and flush
  // exactly like a session's, replacing the online-only write these tests covered one wave
  // earlier. `markAttendance` is gone from `StaffEventsClient` entirely (see `client.ts`'s
  // own header note), so these tests assert against `pending_ops` — the same seam
  // `RosterScreen.test.tsx` asserts a session's mark against — rather than against a mock
  // client method that no longer exists.
  describe('marking attendance on an event register', () => {
    let store: OfflineStore

    beforeEach(() => {
      store = memoryStore()
      setOfflineStore(store)
    })

    afterEach(() => {
      setForcedMode(null)
      setOfflineStore(null)
    })

    function makeRosterClient(over: Partial<StaffEventsClient> = {}) {
      return makeClient({
        registrations: vi
          .fn()
          .mockResolvedValue({ items: ROWS, next_cursor: null, has_more: false }),
        ...over,
      })
    }

    it('queues a mark rather than calling the API', async () => {
      // §10.3 item 1, applied to an event: "the local write is not an API call." The
      // control has ONE path now, same as `RosterScreen`.
      const { EventRosterScreen } = await import('./EventRosterScreen')
      const client = makeRosterClient()
      render(<EventRosterScreen client={client} eventId="e1" locale="he" />)
      const row = (await screen.findAllByTestId('event-roster-row'))[1]!
      await userEvent.click(within(row).getByRole('button', { name: /רון לוי/ }))

      await waitFor(async () => expect(await listPending(store)).toHaveLength(1))
      const [op] = await listPending(store)
      expect(op?.kind).toBe('event.attendance')
      expect(op?.session_id).toBe('e1')
      expect(op?.student_id).toBe('st2')
      expect(op?.payload).toEqual({ attended: true })
    })

    it('toggles present → absent on a second tap, leaving ONE queued op', async () => {
      // §10.5's idempotency starts on the device — the same rule `RosterScreen.test.tsx`
      // pins for a session: a coach cycling a row twice leaves one op carrying the final
      // answer, not two the server has to reconcile.
      const { EventRosterScreen } = await import('./EventRosterScreen')
      const client = makeRosterClient()
      render(<EventRosterScreen client={client} eventId="e1" locale="he" />)
      const row = (await screen.findAllByTestId('event-roster-row'))[0]!
      await userEvent.click(within(row).getByRole('button', { name: /דנה כהן/ }))
      await waitFor(() =>
        expect(within(row).getByRole('button', { name: /דנה כהן/ })).toHaveAccessibleName(
          new RegExp(t('he', 'attendance.roster.present')),
        ),
      )
      await userEvent.click(within(row).getByRole('button', { name: /דנה כהן/ }))

      await waitFor(async () => expect(await listPending(store)).toHaveLength(1))
      const [op] = await listPending(store)
      expect(op?.payload).toEqual({ attended: false })
    })

    it('updates the counter optimistically, before any network round trip', async () => {
      const { EventRosterScreen } = await import('./EventRosterScreen')
      const client = makeRosterClient()
      render(<EventRosterScreen client={client} eventId="e1" locale="he" />)
      const row = (await screen.findAllByTestId('event-roster-row'))[0]!
      expect(await screen.findByTestId('event-roster-live-count')).toHaveTextContent('0/2')
      await userEvent.click(within(row).getByRole('button', { name: /דנה כהן/ }))
      await waitFor(() =>
        expect(screen.getByTestId('event-roster-live-count')).toHaveTextContent('1/2'),
      )
    })

    it('queues a mark while the network is offline, with no error', async () => {
      // The guard this screen shipped with one wave earlier — disable the control, say a
      // connection is required — is gone: the queue is real now, so refusing the tap would
      // be `RosterScreen`'s exact mistake in reverse.
      setForcedMode('offline')
      const { EventRosterScreen } = await import('./EventRosterScreen')
      const client = makeRosterClient()
      render(<EventRosterScreen client={client} eventId="e1" locale="he" />)
      const row = (await screen.findAllByTestId('event-roster-row'))[0]!
      expect(
        screen.queryByText(t('he', 'events.attendance.requiresConnection')),
      ).not.toBeInTheDocument()
      const button = within(row).getByRole('button', { name: /דנה כהן/ })
      expect(button).toBeEnabled()
      await userEvent.click(button)
      await waitFor(async () => expect(await listPending(store)).toHaveLength(1))
    })

    it('lets an assistant coach mark — §3.2 gives every staff role attendance', async () => {
      // No role prop exists on this screen at all, unlike `RosterScreen`'s `canWritePlan`:
      // nothing here can gate the control to a manager by accident.
      const { EventRosterScreen } = await import('./EventRosterScreen')
      const client = makeRosterClient()
      render(<EventRosterScreen client={client} eventId="e1" locale="he" />)
      const row = (await screen.findAllByTestId('event-roster-row'))[0]!
      const button = within(row).getByRole('button', { name: /דנה כהן/ })
      expect(button).toBeEnabled()
      await userEvent.click(button)
      await waitFor(async () => expect(await listPending(store)).toHaveLength(1))
    })

    it('falls back to the cached roster when the live read fails', async () => {
      // §6.5 item — an event's roster reads cache-first, exactly like a session's. Written
      // through `writeWindow` rather than `enqueue`, so this also proves events land in the
      // SAME table `readRoster` already knows how to serve back.
      const { writeWindow } = await import('@studio/core')
      await writeWindow(store, {
        server_time: '2026-11-12T09:00:00.000Z',
        from_time: '2026-11-12T00:00:00.000Z',
        to_time: '2026-11-13T00:00:00.000Z',
        sessions: [],
        rosters: {},
        events: [
          {
            id: 'e1',
            title: 'מבחן סתיו',
            starts_at: '2026-11-26T15:00:00.000Z',
            ends_at: '2026-11-26T17:00:00.000Z',
            location_name: 'אולם א׳',
            status: 'published',
          },
        ],
        event_rosters: {
          e1: [
            {
              student_id: 'st9',
              display_name: 'נועה כספי',
              belt_color_hex: null,
              belt_name: null,
              health_status: 'missing',
              derived_flags: {},
              status: 'unmarked',
              source: null,
              has_absence_report: false,
              absence_reason: null,
            },
          ],
        },
      })
      const { EventRosterScreen } = await import('./EventRosterScreen')
      const client = makeClient({
        read: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
        registrations: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      })
      render(<EventRosterScreen client={client} eventId="e1" locale="he" />)
      expect(await screen.findByText('נועה כספי')).toBeInTheDocument()
      // The cache carries no RSVP — rendering one would be a claim this device cannot check.
      expect(screen.queryByText(t('he', 'events.rsvp.pending'))).not.toBeInTheDocument()
    })

    it('replaces the roster with the blocking stale-queue warning, exactly as a session does', async () => {
      const { enqueue } = await import('@studio/core')
      await enqueue(store, {
        client_mark_id: 'old-event-mark',
        kind: 'event.attendance',
        session_id: 'e1',
        student_id: 'st1',
        payload: { attended: true },
        device_marked_at: '2026-11-01T17:00:00.000Z',
        queued_at: '2026-11-01T17:00:00.000Z',
        person_id: 'person-1',
        attempts: 0,
      })
      queueChanged()
      const { EventRosterScreen } = await import('./EventRosterScreen')
      const client = makeRosterClient()
      render(<EventRosterScreen client={client} eventId="e1" locale="he" clock={() => '2026-11-05T09:00:00.000Z'} />)
      expect(await screen.findByTestId('event-roster-stale-block')).toBeInTheDocument()
      expect(screen.queryByTestId('event-roster')).not.toBeInTheDocument()
    })
  })
})
