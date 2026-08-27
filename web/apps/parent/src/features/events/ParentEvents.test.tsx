// Artboards 12h (אירועים ותחרויות) and 7d (הזמנה לאירוע), the parent's side of §5.8.
//
// **7d finding 1 is the load-bearing test.** §5.8: an RSVP does not count as confirmed
// until the parent signs. On the artboard the confirm button and the consent card are
// independent, simultaneously usable controls — confirm is drawn in the ordinary enabled
// primary style, with no disabled state, no lock and no inline copy — and nothing visual or
// textual ties them. A parent can press confirm without signing.
// `events.consent.blocksConfirmation` ships the sentence; the gate is built.
//
// **12h finding 1.** Three cards render RSVP, consent and payment three different ways:
// two buttons on one, a chip on another, unstyled trailing text on a third. Porting three
// treatments as three variants encodes the inconsistency. One component, one rendering per
// state.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { EventInviteScreen } from './EventInviteScreen'
import { ParentEventsScreen } from './ParentEventsScreen'
import type { ParentEventOut, ParentEventsClient } from './client'

function row(over: Partial<ParentEventOut> = {}): ParentEventOut {
  return {
    event: {
      id: 'e1',
      type: 'competition',
      title: 'אליפות החורף',
      description: null,
      starts_at: '2026-11-26T08:00:00Z',
      ends_at: '2026-11-26T14:00:00Z',
      location_id: null,
      location_text: 'היכל הספורט',
      rsvp_deadline: '2026-11-19T22:00:00Z',
      fee_agorot: 8000,
      requires_consent: true,
      consent_text: 'אני מאשר/ת את השתתפות בני/בתי',
      status: 'published',
      targets: [],
      rsvp_yes_count: 0,
      rsvp_no_count: 0,
      rsvp_pending_count: 1,
      consent_signed_count: 0,
    },
    registration: {
      id: 'r1',
      event_id: 'e1',
      student_id: 's1',
      student_display_name: 'דנה',
      rsvp: 'pending',
      responded_by_person_id: null,
      responded_at: null,
      consent_signed_at: null,
      charge_id: null,
      attended: false,
    },
    confirmed: false,
    ...over,
  }
}

function makeClient(rows: ParentEventOut[] = [row()]): ParentEventsClient {
  const first = rows[0] ?? row()
  return {
    myEvents: vi.fn().mockResolvedValue({ items: rows, next_cursor: null, has_more: false }),
    answer: vi.fn().mockResolvedValue({ registration: first.registration, confirmed: false }),
    signConsent: vi
      .fn()
      .mockResolvedValue({
        registration: { ...first.registration, consent_signed_at: '2026-11-13T09:00:00Z' },
        confirmed: true,
      }),
  } as unknown as ParentEventsClient
}

/**
 * The confirm button, anchored.
 *
 * `מגיע` is a SUBSTRING of `לא מגיע` — yes and no differ by a prefix in Hebrew — so an
 * unanchored regex matches both buttons. Anchoring on the start of the accessible name is
 * what separates them; JS `\b` would not, being ASCII-only.
 */
function confirmButton() {
  return screen.findByRole('button', {
    name: new RegExp(`^${t('he', 'events.rsvp.yes')}`),
  })
}

const NOW = '2026-11-12T09:00:00Z'

function renderInvite(rows: ParentEventOut[] = [row()]) {
  const client = makeClient(rows)
  render(
    <EventInviteScreen
      client={client}
      eventId="e1"
      locale="he"
      now={NOW}
      studentId="s1"
    />,
  )
  return client
}

describe('7d — the event invite', () => {
  it('will not let a parent confirm before signing, and says why', async () => {
    renderInvite()
    const confirm = await confirmButton()
    expect(confirm).toBeDisabled()
    expect(screen.getByText(t('he', 'events.consent.blocksConfirmation'))).toBeInTheDocument()
  })

  it('enables confirm once the consent is signed', async () => {
    renderInvite([
      row({
        registration: { ...row().registration, consent_signed_at: '2026-11-13T09:00:00Z' },
      }),
    ])
    const confirm = await confirmButton()
    expect(confirm).not.toBeDisabled()
  })

  it('lets a parent decline without signing anything', async () => {
    // The gate is on CONFIRMATION. §5.8 does not ask a parent to sign a consent in order
    // to say their child is not coming, and requiring it would be a form standing between
    // a family and "no".
    const client = renderInvite()
    const decline = await screen.findByRole('button', { name: t('he', 'events.rsvp.no') })
    expect(decline).not.toBeDisabled()
    await userEvent.click(decline)
    expect(client.answer).toHaveBeenCalledWith('e1', 's1', 'no')
  })

  it('says that confirming creates a charge', async () => {
    // 7d finding 2 — events.fee.chargeOnConfirm exists and the artboard does not draw it.
    renderInvite()
    expect(
      await screen.findByText(t('he', 'events.fee.chargeOnConfirm')),
    ).toBeInTheDocument()
  })

  it('renders the fee through MoneyDisplay, including inside the button label', async () => {
    // The riskiest bidi case on the artboard: a {digits}₪ pair inside an RTL button label.
    // The primitive owns the isolation; string interpolation is where it flips.
    renderInvite()
    const confirm = await confirmButton()
    expect(within(confirm).getByText(/80/).closest('.studio-money')).not.toBeNull()
  })

  it('shows an answered state and a way to change it', async () => {
    // 7d finding 3 / 12h — events.rsvp.answered and rsvp.change both exist and neither is
    // drawn. A parent who confirms currently has no way back.
    renderInvite([
      row({
        registration: {
          ...row().registration,
          rsvp: 'yes',
          consent_signed_at: '2026-11-13T09:00:00Z',
        },
        confirmed: true,
      }),
    ])
    expect(await screen.findByText(t('he', 'events.rsvp.youConfirmed'))).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: t('he', 'events.rsvp.change') }),
    ).toBeInTheDocument()
  })

  it('says the deadline has passed rather than offering buttons that fail', async () => {
    // 7d finding 7 — not drawn, on the screen built around a deadline.
    renderInvite([
      row({ event: { ...row().event, rsvp_deadline: '2026-11-01T22:00:00Z' } }),
    ])
    expect(
      await screen.findByText(t('he', 'events.rsvp.deadlinePassed')),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t('he', 'events.rsvp.no') })).toBeNull()
  })

  it('publishes no staff phone number', async () => {
    // 7d finding 4 — the artboard prints a coach's personal mobile to every parent. §11
    // governs personal data and a coach's mobile is personal data.
    renderInvite()
    await screen.findByRole('button', { name: t('he', 'events.rsvp.no') })
    expect(screen.queryByText(/05\d[-\s]?\d{3}[-\s]?\d{4}/)).toBeNull()
  })

  it('offers no capacity line and no transport row', async () => {
    // The cut list. §5.8's event has neither, and 7d draws both.
    renderInvite()
    await screen.findByRole('button', { name: t('he', 'events.rsvp.no') })
    expect(screen.queryByText(/מקומות/)).toBeNull()
    expect(screen.queryByText(/הסעה/)).toBeNull()
  })
})

describe('12h — the parent event list', () => {
  function renderList(rows: ParentEventOut[]) {
    render(
      <ParentEventsScreen
        client={makeClient(rows)}
        locale="he"
        now={NOW}
        onOpen={vi.fn()}
      />,
    )
  }

  it('renders one canonical treatment per RSVP state', async () => {
    // 12h finding 1 — the canvas gives three cards three different renderings of the same
    // three states. One component, and the state decides the copy rather than the card.
    renderList([
      row(),
      row({
        event: { ...row().event, id: 'e2', title: 'סמינר' },
        registration: { ...row().registration, id: 'r2', event_id: 'e2', rsvp: 'yes' },
        confirmed: true,
      }),
      row({
        event: { ...row().event, id: 'e3', title: 'טיול' },
        registration: { ...row().registration, id: 'r3', event_id: 'e3', rsvp: 'no' },
      }),
    ])
    expect(
      within(await screen.findByRole('article', { name: 'אליפות החורף' })).getByText(
        t('he', 'events.rsvp.awaitingYourAnswer'),
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('article', { name: 'סמינר' })).getByText(
        t('he', 'events.rsvp.youConfirmed'),
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByRole('article', { name: 'טיול' })).getByText(
        t('he', 'events.rsvp.youDeclined'),
      ),
    ).toBeInTheDocument()
  })

  it('speaks to the parent in the second person', async () => {
    // 12h finding 7 — every rsvp.* key is third-person and every screen string is second.
    renderList([row()])
    expect(
      await screen.findByText(t('he', 'events.rsvp.awaitingYourAnswer')),
    ).toBeInTheDocument()
  })

  it('shows no medal line on a past event', async () => {
    // The cut list. A competition RESULT is not modelled: §5.8 models an RSVP.
    renderList([row({ event: { ...row().event, starts_at: '2026-10-01T08:00:00Z' } })])
    await screen.findByRole('article', { name: 'אליפות החורף' })
    expect(screen.queryByText(/מדלי/)).toBeNull()
  })

  it('renders the empty state', async () => {
    renderList([])
    expect(await screen.findByText(t('he', 'events.list.empty'))).toBeInTheDocument()
  })
})
