// The two-way answer, tested through the SEAM and not through its props.
//
// CLAUDE.md: "A field added to an API is not proven by a test that constructs the
// component's props by hand." So these render the card with a client whose fetches are
// stubbed, and assert on the REQUEST that went out — the pair the server stores — rather
// than on a callback having fired.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { NextLessonCard } from './NextLessonCard'
import { makeIntentClient } from './intentClient'
import type { Fetcher } from './intentClient'

const LESSON = {
  sessionId: 'sess-1',
  studentId: 'kid-1',
  studentName: 'נעמי',
  groupName: 'גוזלים',
  // Well into the future, so nothing here depends on when the suite runs.
  startsAt: '2099-01-01T14:00:00Z',
  beltColorHex: '#c76a1e',
}

// Typed as the client's own Fetcher so tsc checks the stub against the real seam — a
// stub that returns a bare Response type-checks nowhere and passes at runtime, which is
// the gap that lets a signature drift.
const ok: Fetcher = async () => new Response(null, { status: 204 })

describe('NextLessonCard', () => {
  it('offers both answers, not just the negative', () => {
    render(
      <NextLessonCard
        locale="he"
        lesson={LESSON}
        intent="unanswered"
        client={makeIntentClient(vi.fn(ok))}
        onChanged={() => {}}
      />,
    )
    expect(screen.getByTestId('intent-coming')).toHaveTextContent(
      t('he', 'attendance.intent.coming'),
    )
    expect(screen.getByTestId('intent-not-coming')).toHaveTextContent(
      t('he', 'attendance.intent.notComing'),
    )
    // Nothing said yet — neither side is pressed, which is the third state.
    expect(screen.getByTestId('intent-coming')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByTestId('intent-not-coming')).toHaveAttribute('aria-pressed', 'false')
  })

  it('confirms against the (session, student) pair the server stores', async () => {
    const fetcher = vi.fn(ok)
    render(
      <NextLessonCard
        locale="he"
        lesson={LESSON}
        intent="unanswered"
        client={makeIntentClient(fetcher)}
        onChanged={() => {}}
      />,
    )
    await userEvent.click(screen.getByTestId('intent-coming'))
    expect(fetcher).toHaveBeenCalledWith('/api/v1/attendance-confirmations/sess-1/kid-1', {
      method: 'PUT',
    })
  })

  it('reports an absence through §5.7s existing pre-report, not a new path', async () => {
    // The absence half is what writes the register mark a coach reads and what notifies
    // the manager. A second endpoint here would have quietly skipped both.
    const fetcher = vi.fn(ok)
    render(
      <NextLessonCard
        locale="he"
        lesson={LESSON}
        intent="unanswered"
        client={makeIntentClient(fetcher)}
        onChanged={() => {}}
      />,
    )
    await userEvent.click(screen.getByTestId('intent-not-coming'))
    const call = fetcher.mock.calls.at(0)
    expect(call?.[0]).toBe('/api/v1/absence-reports')
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({
      session_id: 'sess-1',
      student_id: 'kid-1',
    })
  })

  it('marks the chosen side with a tick as well as a fill', () => {
    // Never colour alone — a selected state is as much a status as a chip is.
    const { container } = render(
      <NextLessonCard
        locale="he"
        lesson={LESSON}
        intent="coming"
        client={makeIntentClient(vi.fn(ok))}
        onChanged={() => {}}
      />,
    )
    const coming = screen.getByTestId('intent-coming')
    expect(coming).toHaveAttribute('aria-pressed', 'true')
    expect(coming.querySelector('svg')).not.toBeNull()
    expect(screen.getByTestId('intent-not-coming').querySelector('svg')).toBeNull()
    expect(container).toBeTruthy()
  })

  it('renders what the SERVER said, so a refusal cannot leave a false answer on screen', async () => {
    // §10.2's failure made visible: the parent believes they told the club, the coach was
    // never told. The card keeps showing the real state and names which refusal happened.
    const fetcher = vi.fn(
      async () =>
        new Response(JSON.stringify({ detail: { code: 'too_late' } }), {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }),
    )
    const onChanged = vi.fn()
    render(
      <NextLessonCard
        locale="he"
        lesson={LESSON}
        intent="unanswered"
        client={makeIntentClient(fetcher)}
        onChanged={onChanged}
      />,
    )
    await userEvent.click(screen.getByTestId('intent-coming'))
    expect(screen.getByTestId('intent-refusal')).toHaveTextContent(
      t('he', 'attendance.absence.tooLate'),
    )
    // Still unpressed, and the caller was never told to re-read.
    expect(screen.getByTestId('intent-coming')).toHaveAttribute('aria-pressed', 'false')
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('re-reads from the server after an answer lands', async () => {
    const onChanged = vi.fn()
    render(
      <NextLessonCard
        locale="he"
        lesson={LESSON}
        intent="unanswered"
        client={makeIntentClient(vi.fn(ok))}
        onChanged={onChanged}
      />,
    )
    await userEvent.click(screen.getByTestId('intent-not-coming'))
    expect(onChanged).toHaveBeenCalledOnce()
  })
})
