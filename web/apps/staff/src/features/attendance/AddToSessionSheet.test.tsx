// The owner's two asks in one popup (2026-10-13): a manager marking a child who came from
// another group, and the trial form no longer being a page of its own.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { AddToSessionSheet } from './AddToSessionSheet'
import type { StaffPeopleClient, StudentSummary } from '../people'

const VISITOR = {
  id: 'st-9',
  first_name: 'מיכאל',
  last_name: 'כהן',
  group_names: ['קבוצה 5'],
} as unknown as StudentSummary

const client = (items: StudentSummary[] = [VISITOR]): StaffPeopleClient =>
  ({ search: vi.fn(() => Promise.resolve({ items })) }) as unknown as StaffPeopleClient

function renderSheet(over: Partial<Parameters<typeof AddToSessionSheet>[0]> = {}) {
  const onPickStudent = vi.fn()
  render(
    <AddToSessionSheet
      locale="he"
      peopleClient={over.peopleClient ?? client()}
      onPickStudent={over.onPickStudent ?? onPickStudent}
      onClose={over.onClose ?? vi.fn()}
      alreadyOnRoster={over.alreadyOnRoster ?? new Set()}
      trialGroupId={over.trialGroupId ?? 'g-1'}
      trialSessionId={over.trialSessionId ?? 's-1'}
    />,
  )
  return { onPickStudent }
}

describe('adding somebody to a session', () => {
  it('is a dialog, not a page', () => {
    renderSheet()
    const sheet = screen.getByTestId('add-to-session-sheet')
    expect(sheet).toHaveAttribute('role', 'dialog')
    expect(sheet).toHaveAttribute('aria-modal', 'true')
  })

  it('finds a student from another group and hands them back', async () => {
    const { onPickStudent } = renderSheet()

    await userEvent.type(screen.getByTestId('add-to-session-search'), 'מיכ')

    await userEvent.click(await screen.findByTestId(`add-to-session-pick-${VISITOR.id}`))
    expect(onPickStudent).toHaveBeenCalledWith(VISITOR)
  })

  it('shows which group they come from, which is the whole question a coach has', async () => {
    renderSheet()
    await userEvent.type(screen.getByTestId('add-to-session-search'), 'מיכ')
    expect(await screen.findByText('קבוצה 5')).toBeInTheDocument()
  })

  it('leaves out students already on this roster — adding them again does nothing visible', async () => {
    renderSheet({ alreadyOnRoster: new Set([VISITOR.id]) })

    await userEvent.type(screen.getByTestId('add-to-session-search'), 'מיכ')

    await waitFor(() => expect(screen.getByTestId('add-to-session-none')).toBeInTheDocument())
  })

  it('asks the server nothing for one letter', async () => {
    const peopleClient = client()
    renderSheet({ peopleClient })

    await userEvent.type(screen.getByTestId('add-to-session-search'), 'מ')

    expect(peopleClient.search).not.toHaveBeenCalled()
  })

  it('carries the trial form on its second tab, where the page used to be', async () => {
    renderSheet()
    expect(screen.queryByTestId('trial-in-class')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('add-to-session-tab-trial'))

    expect(screen.getByTestId('trial-in-class')).toBeInTheDocument()
  })

  it('says plainly that a visit changes nothing about the student', () => {
    renderSheet()
    expect(
      screen.getByText(t('he', 'attendance.addToSession.existingHint')),
    ).toBeInTheDocument()
  })
})

// A name nobody in the club carries (owner, 2026-10-13): "a manager needs to be able to
// write a name and add attendance". The club's five extra groups — נבחרת, נבחרת בנות,
// קרוספיט, ג'ודו גילאי 8-12 and אימון טכניקה אישי — have NOBODY enrolled, so an extra
// session's roster is empty by construction and every name on it arrives this way.
//
// Logging a trial recorded `attended` on the BOOKING and no attendance row, so the child a
// coach had just written down did not appear on the roster they were standing in front of.
describe('a name written into the trial tab', () => {
  it('is marked present on this session, not only booked', async () => {
    const onPickStudent = vi.fn()
    const logTrial = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ id: 'tb-1', student_id: 'new-st', group_id: 'g', session_id: 's' }), {
          status: 201,
        }),
      ),
    )
    render(
      <AddToSessionSheet
        locale="he"
        peopleClient={{ ...client(), logTrial } as unknown as StaffPeopleClient}
        onPickStudent={onPickStudent}
        onClose={vi.fn()}
        alreadyOnRoster={new Set()}
        trialGroupId="g-1"
        trialSessionId="s-1"
      />,
    )

    await userEvent.click(screen.getByTestId('add-to-session-tab-trial'))
    await userEvent.type(screen.getByLabelText('שם פרטי'), 'יונתן')
    await userEvent.type(screen.getByLabelText('שם משפחה'), 'לוי')
    await userEvent.type(screen.getByLabelText('הורה'), 'דנה לוי')
    await userEvent.type(screen.getByLabelText('טלפון'), '0521234567')
    await userEvent.click(screen.getByTestId('trial-submit'))

    await waitFor(() =>
      expect(onPickStudent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'new-st', first_name: 'יונתן', last_name: 'לוי' }),
      ),
    )
  })
})
