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
      trialForm={over.trialForm ?? <p data-testid="the-trial-form" />}
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
    expect(screen.queryByTestId('the-trial-form')).not.toBeInTheDocument()

    await userEvent.click(screen.getByTestId('add-to-session-tab-trial'))

    expect(screen.getByTestId('the-trial-form')).toBeInTheDocument()
  })

  it('says plainly that a visit changes nothing about the student', () => {
    renderSheet()
    expect(
      screen.getByText(t('he', 'attendance.addToSession.existingHint')),
    ).toBeInTheDocument()
  })
})
