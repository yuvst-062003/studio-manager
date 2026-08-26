// Artboard 7b — יצירת אירוע.
//
// The audit's findings are the tests.
//
// **Finding 1 — the type enum and the creation form disagree.** The canvas draws five type
// cards, three of which (אימון מיוחד, מחנה, אירוע מועדון) are not members, while seminar,
// joint training and trip are members with no card. The enum wins; the form offers six.
//
// **Finding 2 — consent wording is required and the artboard has no input for it.**
// `events.consent.text` and `consent.textRequired` both exist and the form offers nowhere
// to write it. A required field with no input. It exists here.
//
// **Finding 8 — nothing is marked required and nothing errors**, including the field that
// does not exist. Both states are built, and the validation mirrors the two model
// validators so the CHECK constraints behind them never fire: a constraint violation
// reaches the manager as a 500 with no field attached, and the form cannot mark it.
//
// **Finding 10 — `events.fee.chargeOnConfirm` and `consent.blocksConfirmation` both exist
// and neither is drawn**, on the screen that configures both.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { EventForm } from './EventForm'
import type { DashboardEventsClient } from './client'

function makeClient(over: Partial<DashboardEventsClient> = {}): DashboardEventsClient {
  return {
    create: vi.fn().mockResolvedValue({ id: 'e1' }),
    publish: vi.fn().mockResolvedValue({ event: { id: 'e1' }, registrations_created: 3 }),
    ...over,
  } as unknown as DashboardEventsClient
}

function renderForm(client: DashboardEventsClient, onSaved = vi.fn()) {
  render(<EventForm client={client} locale="he" onSaved={onSaved} targets={[]} />)
  return onSaved
}

async function fillTheMinimum() {
  await userEvent.type(screen.getByLabelText(t('he', 'events.form.name')), 'אליפות')
  await userEvent.type(
    screen.getByLabelText(t('he', 'events.form.startsAt')),
    '2026-11-26T10:00',
  )
}

describe('7b — the create form', () => {
  it('offers exactly the six enum members as types', () => {
    renderForm(makeClient())
    const group = screen.getByRole('radiogroup', { name: t('he', 'events.form.type') })
    expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(6)
    // The canvas's three non-members.
    expect(screen.queryByText('אימון מיוחד')).toBeNull()
    expect(screen.queryByText('מחנה')).toBeNull()
    expect(screen.queryByText('אירוע מועדון')).toBeNull()
  })

  it('has a multi-line input for the consent wording, which the artboard does not', async () => {
    renderForm(makeClient())
    await userEvent.click(
      screen.getByRole('switch', { name: t('he', 'events.consent.required') }),
    )
    const field = screen.getByLabelText(t('he', 'events.consent.text'))
    // `event.consent_text` is 4000 characters. A single-line input for a paragraph a parent
    // has to read and agree to is the reason TextField grew a multiline mode.
    expect(field.tagName).toBe('TEXTAREA')
  })

  it('refuses to save consent-required with no wording, as a field error', async () => {
    const client = makeClient()
    renderForm(client)
    await fillTheMinimum()
    await userEvent.click(
      screen.getByRole('switch', { name: t('he', 'events.consent.required') }),
    )
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))

    // The CHECK is the backstop, not the gate: a violation arrives as a 500 with no field
    // attached, so the form could not mark the offending input.
    expect(client.create).not.toHaveBeenCalled()
    expect(screen.getByText(t('he', 'events.consent.textRequired'))).toBeInTheDocument()
  })

  it('refuses an end before a start, in the same way', async () => {
    const client = makeClient()
    renderForm(client)
    await fillTheMinimum()
    await userEvent.type(
      screen.getByLabelText(t('he', 'events.form.endsAt')),
      '2026-11-26T08:00',
    )
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    expect(client.create).not.toHaveBeenCalled()
    expect(screen.getByText(t('he', 'events.form.endBeforeStart'))).toBeInTheDocument()
  })

  it('marks the required fields, which the artboard never does', async () => {
    renderForm(makeClient())
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    expect(screen.getAllByText(t('he', 'events.form.required')).length).toBeGreaterThan(0)
  })

  it('says that confirming participation is what creates the charge', async () => {
    renderForm(makeClient())
    await userEvent.click(screen.getByRole('switch', { name: t('he', 'events.fee.label') }))
    // Finding 10 — the key exists and the canvas never draws it.
    expect(screen.getByText(t('he', 'events.fee.chargeOnConfirm'))).toBeInTheDocument()
  })

  it('says a consent gates confirmation, on the screen that configures both', async () => {
    renderForm(makeClient())
    await userEvent.click(
      screen.getByRole('switch', { name: t('he', 'events.consent.required') }),
    )
    expect(screen.getByText(t('he', 'events.consent.blocksConfirmation'))).toBeInTheDocument()
  })

  it('offers no capacity, no minimum age and no transport field', () => {
    // The cut list: three fields the canvas draws and §4.3 has no column for.
    renderForm(makeClient())
    expect(screen.queryByText(/מקסימום/)).toBeNull()
    expect(screen.queryByText(/גיל מינימלי/)).toBeNull()
    expect(screen.queryByText(/הסעה/)).toBeNull()
  })

  it('saves a draft without publishing', async () => {
    // Finding 3 — the canvas makes publish-and-send one button, and 9i and 9d both draw a
    // state it cannot produce. Creating is creating; publishing is its own action.
    const client = makeClient()
    const onSaved = renderForm(client)
    await fillTheMinimum()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    expect(client.create).toHaveBeenCalledTimes(1)
    expect(client.publish).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalledWith('e1')
  })

  it('publishes as a second, separate action and reports the roster it made', async () => {
    const client = makeClient()
    renderForm(client)
    await fillTheMinimum()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.publish') }))
    expect(client.create).toHaveBeenCalledTimes(1)
    expect(client.publish).toHaveBeenCalledWith('e1')
    expect(await screen.findByText(/3/)).toBeInTheDocument()
  })

  it('sends the fee in agorot, never in shekels', async () => {
    // G2. A manager types 80; the wire carries 8000. A float here is right by luck for most
    // prices and one agora short on an ordinary family of them.
    const client = makeClient()
    renderForm(client)
    await fillTheMinimum()
    await userEvent.click(screen.getByRole('switch', { name: t('he', 'events.fee.label') }))
    await userEvent.type(screen.getByLabelText(t('he', 'events.fee.label')), '80')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    expect(client.create).toHaveBeenCalledWith(
      expect.objectContaining({ fee_agorot: 8000 }),
    )
  })

  it('sends no fee at all when the charge toggle is off', async () => {
    // NULL is free; zero is not. A zero-fee event would create a zero charge and a receipt
    // for nothing.
    const client = makeClient()
    renderForm(client)
    await fillTheMinimum()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    expect(client.create).toHaveBeenCalledWith(expect.objectContaining({ fee_agorot: null }))
  })

  it('surfaces a server refusal instead of looking saved', async () => {
    const client = makeClient({ create: vi.fn().mockRejectedValue(new Error('409')) })
    const onSaved = renderForm(client)
    await fillTheMinimum()
    await userEvent.click(screen.getByRole('button', { name: t('he', 'events.form.save') }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
})
