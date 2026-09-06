// §4.8 / §6.1 (checkpoint C10) — the two prototype defects this screen must not repeat,
// plus the seam that turns the three-step form into a real request.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { studioWallTimeToUtc } from '@studio/core'
import { CoachConstraintsScreen } from './CoachConstraintsScreen'
import type { CoachConstraintRow, CoachConstraintsClient } from './constraintsClient'

const TODAY = '2026-11-10T09:00:00Z'

function row(overrides: Partial<CoachConstraintRow> = {}): CoachConstraintRow {
  return {
    id: 'c1',
    person_id: 'p1',
    starts_at: '2026-11-10T00:00:00Z',
    ends_at: '2026-11-11T00:00:00Z',
    all_day: true,
    reason: 'illness',
    note: null,
    status: 'pending',
    substitute_person_id: null,
    decided_by_person_id: null,
    decided_at: null,
    ...overrides,
  }
}

function stubClient(overrides: Partial<CoachConstraintsClient> = {}): CoachConstraintsClient {
  return {
    listMine: vi.fn(async () => []),
    file: vi.fn(async (input) => row({ ...input })),
    withdraw: vi.fn(async (id) => row({ id, status: 'withdrawn' })),
    ...overrides,
  }
}

describe('the note field renders only for reason=other', () => {
  it('is absent for the default reason', () => {
    render(<CoachConstraintsScreen locale="he" client={stubClient()} today={TODAY} />)
    expect(screen.queryByPlaceholderText(/טיפול רפואי/)).not.toBeInTheDocument()
  })

  it('appears, and is required, once "other" is chosen', async () => {
    const user = userEvent.setup()
    render(<CoachConstraintsScreen locale="he" client={stubClient()} today={TODAY} />)
    await user.click(screen.getByText('אחר'))
    const note = screen.getByPlaceholderText(/טיפול רפואי/)
    expect(note).toBeRequired()
  })

  it('disables the submit button and names the problem while "other" has no note', async () => {
    const user = userEvent.setup()
    const client = stubClient()
    render(<CoachConstraintsScreen locale="he" client={client} today={TODAY} />)
    await user.click(screen.getByText('אחר'))
    expect(screen.getByRole('alert')).toHaveTextContent('יש לפרט את סיבת האילוץ')
    expect(screen.getByRole('button', { name: /שליחת האילוץ/ })).toBeDisabled()
    expect(client.file).not.toHaveBeenCalled()
  })
})

describe('a filed constraint is honest about being unresolved', () => {
  it('the success toast says it is waiting for an answer, not that it is settled', async () => {
    const user = userEvent.setup()
    const client = stubClient()
    render(<CoachConstraintsScreen locale="he" client={client} today={TODAY} />)
    await user.click(screen.getByRole('button', { name: /שליחת האילוץ/ }))
    await waitFor(() => expect(client.file).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('status')).toHaveTextContent('ממתין לתשובת ההנהלה')
  })

  it("a pending row's own badge says the same — waiting, never settled", async () => {
    const client = stubClient({ listMine: vi.fn(async () => [row({ status: 'pending' })]) })
    render(<CoachConstraintsScreen locale="he" client={client} today={TODAY} />)
    expect(await screen.findByTestId('constraint-status')).toHaveTextContent(
      'ממתין לתשובת ההנהלה',
    )
  })
})

describe('an all-day submission converts to UTC via the studio zone, not a fixed offset', () => {
  it('sends midnight-to-midnight in Asia/Jerusalem for the default day (today)', async () => {
    // `today` (09:00 UTC on 2026-11-10) is 11:00 in Jerusalem that same day, so the form's
    // own default — single day, all day, today — is exercised with no field interaction,
    // which is also what keeps this independent of jsdom's native `<input type="date">`
    // quirks.
    const user = userEvent.setup()
    const client = stubClient()
    render(<CoachConstraintsScreen locale="he" client={client} today={TODAY} />)

    await user.click(screen.getByRole('button', { name: /שליחת האילוץ/ }))

    await waitFor(() => expect(client.file).toHaveBeenCalledTimes(1))
    const sent = (client.file as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(sent.all_day).toBe(true)
    expect(sent.starts_at).toBe(studioWallTimeToUtc('2026-11-10', '00:00'))
    expect(sent.ends_at).toBe(studioWallTimeToUtc('2026-11-11', '00:00'))
  })
})

describe('withdrawing', () => {
  it('is offered on a pending row and calls the client', async () => {
    const user = userEvent.setup()
    const client = stubClient({ listMine: vi.fn(async () => [row({ status: 'pending' })]) })
    render(<CoachConstraintsScreen locale="he" client={client} today={TODAY} />)
    const button = await screen.findByRole('button', { name: 'משיכת האילוץ' })
    await user.click(button)
    await waitFor(() => expect(client.withdraw).toHaveBeenCalledWith('c1'))
  })

  it('is not offered on an already-refused row', async () => {
    const client = stubClient({ listMine: vi.fn(async () => [row({ status: 'refused' })]) })
    render(<CoachConstraintsScreen locale="he" client={client} today={TODAY} />)
    await screen.findByTestId('constraint-history-row')
    expect(screen.queryByRole('button', { name: 'משיכת האילוץ' })).not.toBeInTheDocument()
  })
})

describe('an all-day range spanning one day reads as one day, not two', () => {
  it('does not show the day after an exclusive midnight end as a second day', async () => {
    // starts_at/ends_at exactly as a single all-day submission produces them.
    const client = stubClient({
      listMine: vi.fn(async () => [
        row({ starts_at: '2026-11-09T22:00:00Z', ends_at: '2026-11-10T22:00:00Z', all_day: true }),
      ]),
    })
    render(<CoachConstraintsScreen locale="he" client={client} today={TODAY} />)
    const rowEl = await screen.findByTestId('constraint-history-row')
    expect(rowEl.textContent).not.toMatch(/–/)
  })
})
