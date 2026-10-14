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
  const onPickStudents = vi.fn()
  render(
    <AddToSessionSheet
      locale="he"
      peopleClient={over.peopleClient ?? client()}
      mode={over.mode ?? 'existing'}
      onPickStudents={over.onPickStudents ?? onPickStudents}
      onClose={over.onClose ?? vi.fn()}
      alreadyOnRoster={over.alreadyOnRoster ?? new Set()}
      trialGroupId={over.trialGroupId ?? 'g-1'}
      trialSessionId={over.trialSessionId ?? 's-1'}
    />,
  )
  return { onPickStudents }
}

describe('adding somebody to a session', () => {
  it('is a dialog, not a page', () => {
    renderSheet()
    const sheet = screen.getByTestId('add-to-session-sheet')
    expect(sheet).toHaveAttribute('role', 'dialog')
    expect(sheet).toHaveAttribute('aria-modal', 'true')
  })

  it('finds a student from another group and hands them back', async () => {
    const { onPickStudents } = renderSheet()

    await userEvent.type(screen.getByTestId('add-to-session-search'), 'מיכ')

    await userEvent.click(await screen.findByTestId(`add-to-session-pick-${VISITOR.id}`))
    await userEvent.click(screen.getByTestId('add-to-session-commit'))
    expect(onPickStudents).toHaveBeenCalledWith([VISITOR])
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

  it('shows the whole club the moment it opens, with nothing typed', async () => {
    // Owner, 2026-10-13, on a קרוספיט session: "I cannot filter all the students at all,
    // and when I search for a student I cannot find him." The list used to stay empty until
    // two characters were typed — on a group with nobody enrolled that is a dead end, and
    // the server answers an empty `q` with the whole club.
    const peopleClient = client()
    renderSheet({ peopleClient })

    expect(await screen.findByTestId(`add-to-session-pick-${VISITOR.id}`)).toBeInTheDocument()
    expect(peopleClient.search).toHaveBeenCalledWith('')
  })

  it('narrows the list as letters are typed, including the first one', async () => {
    renderSheet({
      peopleClient: client([
        VISITOR,
        { id: 'st-2', first_name: 'נועה', last_name: 'לוי', group_names: ['קבוצה 1'] } as never,
      ]),
    })
    await screen.findByTestId(`add-to-session-pick-${VISITOR.id}`)

    await userEvent.type(screen.getByTestId('add-to-session-search'), 'נ')

    expect(screen.queryByTestId(`add-to-session-pick-${VISITOR.id}`)).not.toBeInTheDocument()
    expect(screen.getByTestId('add-to-session-pick-st-2')).toBeInTheDocument()
  })

  it('finds a child by their family name too', async () => {
    renderSheet()
    await screen.findByTestId(`add-to-session-pick-${VISITOR.id}`)

    await userEvent.type(screen.getByTestId('add-to-session-search'), 'כהן')

    expect(screen.getByTestId(`add-to-session-pick-${VISITOR.id}`)).toBeInTheDocument()
  })

  it('shows the club list and no trial form — the trial is its own popup now', () => {
    renderSheet()
    expect(screen.queryByTestId('trial-in-class')).not.toBeInTheDocument()
    expect(screen.getByTestId('add-to-session-existing')).toBeInTheDocument()
  })

  it('carries the trial form when it is opened as the trial popup', () => {
    renderSheet({ mode: 'trial' })
    expect(screen.getByTestId('trial-in-class')).toBeInTheDocument()
    expect(screen.queryByTestId('add-to-session-existing')).not.toBeInTheDocument()
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
describe('a name written into the trial popup', () => {
  it('is marked present on this session, not only booked', async () => {
    const onPickStudents = vi.fn()
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
        onPickStudents={onPickStudents}
        onClose={vi.fn()}
        alreadyOnRoster={new Set()}
        mode="trial"
        trialGroupId="g-1"
        trialSessionId="s-1"
      />,
    )

    await userEvent.type(screen.getByLabelText('שם פרטי'), 'יונתן')
    await userEvent.type(screen.getByLabelText('שם משפחה'), 'לוי')
    await userEvent.type(screen.getByLabelText('הורה'), 'דנה לוי')
    await userEvent.type(screen.getByLabelText('טלפון'), '0521234567')
    await userEvent.click(screen.getByTestId('trial-submit'))

    await waitFor(() =>
      expect(onPickStudents).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'new-st', first_name: 'יונתן', last_name: 'לוי' }),
      ]),
    )
  })
})

// "Allow, in add a student, to pick several students at once from the list" (owner,
// 2026-10-13). Six children of קבוצה 2 turning up to a squad session used to be six round
// trips through the same sheet: type, pick, sheet closes, open it again.
describe('picking several children in one trip', () => {
  const SECOND = {
    id: 'st-2',
    first_name: 'נועה',
    last_name: 'לוי',
    group_names: ['קבוצה 1'],
  } as unknown as StudentSummary

  it('hands back everyone ticked, in one call', async () => {
    const { onPickStudents } = renderSheet({ peopleClient: client([VISITOR, SECOND]) })
    await screen.findByTestId(`add-to-session-pick-${VISITOR.id}`)

    await userEvent.click(screen.getByTestId(`add-to-session-pick-${VISITOR.id}`))
    await userEvent.click(screen.getByTestId(`add-to-session-pick-${SECOND.id}`))
    await userEvent.click(screen.getByTestId('add-to-session-commit'))

    expect(onPickStudents).toHaveBeenCalledTimes(1)
    expect(onPickStudents).toHaveBeenCalledWith([VISITOR, SECOND])
  })

  it('writes nothing until the button is pressed', async () => {
    const { onPickStudents } = renderSheet({ peopleClient: client([VISITOR, SECOND]) })
    await screen.findByTestId(`add-to-session-pick-${VISITOR.id}`)

    await userEvent.click(screen.getByTestId(`add-to-session-pick-${VISITOR.id}`))

    expect(onPickStudents).not.toHaveBeenCalled()
  })

  it('counts what it is about to do', async () => {
    renderSheet({ peopleClient: client([VISITOR, SECOND]) })
    await screen.findByTestId(`add-to-session-pick-${VISITOR.id}`)
    expect(screen.getByTestId('add-to-session-commit')).toBeDisabled()

    await userEvent.click(screen.getByTestId(`add-to-session-pick-${VISITOR.id}`))
    expect(screen.getByTestId('add-to-session-commit')).toHaveTextContent(
      t('he', 'attendance.addToSession.commitOne'),
    )

    await userEvent.click(screen.getByTestId(`add-to-session-pick-${SECOND.id}`))
    expect(screen.getByTestId('add-to-session-commit')).toHaveTextContent('2')
  })

  it('keeps a tick when the search changes — the whole point of one trip', async () => {
    const { onPickStudents } = renderSheet({ peopleClient: client([VISITOR, SECOND]) })
    await screen.findByTestId(`add-to-session-pick-${VISITOR.id}`)

    await userEvent.click(screen.getByTestId(`add-to-session-pick-${VISITOR.id}`))
    // Filter down to the other child — the first one leaves the list entirely.
    await userEvent.type(screen.getByTestId('add-to-session-search'), 'נועה')
    expect(screen.queryByTestId(`add-to-session-pick-${VISITOR.id}`)).not.toBeInTheDocument()
    await userEvent.click(screen.getByTestId(`add-to-session-pick-${SECOND.id}`))
    await userEvent.click(screen.getByTestId('add-to-session-commit'))

    expect(onPickStudents).toHaveBeenCalledWith([VISITOR, SECOND])
  })

  it('un-ticks what was ticked by mistake', async () => {
    renderSheet({ peopleClient: client([VISITOR, SECOND]) })
    await screen.findByTestId(`add-to-session-pick-${VISITOR.id}`)

    const row = screen.getByTestId(`add-to-session-pick-${VISITOR.id}`)
    await userEvent.click(row)
    expect(row).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(row)

    expect(row).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('add-to-session-commit')).toBeDisabled()
  })
})

// "The text שיעור ניסיון is not clear — change it to adding a student to a trial lesson"
// (owner, 2026-10-14). The register's two buttons sit one above the other, and a label that
// names the THING rather than the ACT reads as a filter or a heading beside one that says
// `הוספת חניך מרשימת החניכים`.
describe('the trial button says what pressing it does', () => {
  it('names the act, not the lesson', () => {
    const label = t('he', 'attendance.addToSession.trial')
    expect(label).toContain('הוספת חניך')
    expect(label).toContain('שיעור ניסיון')
  })

  it('carries the same words on the popup it opens, so the press and the sheet agree', () => {
    renderSheet({ mode: 'trial' })
    // The sheet's own title, by the id its dialog is labelled with — the trial form inside
    // it has headings of its own, which is why this asks for the right one.
    expect(document.getElementById('add-to-session-title')).toHaveTextContent(
      t('he', 'attendance.addToSession.trial'),
    )
  })
})
