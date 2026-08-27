// Artboard 12d — התקדמות חגורה ומבחנים.
//
// **Eleven belt fills, and two of them carry any ring at all on the canvas.** Only the
// white segment and the white half of a bi-colour one, and both in a translucent tint
// rather than D7's solid foreground. Yellow is bare. The header accent is bare. All four
// history bars are bare. And **the current segment is bare** — the one segment the whole
// screen exists to show.
//
// **Finding 4 is the subtle one.** A future segment is drawn at reduced alpha. The ring
// must NOT fade with it: it is a contrast obligation (SC 1.4.11), not decoration. `BeltBar`
// takes the fill as a prop and reads `--belt-ring` from the theme, so an 8-digit hex fades
// the fill alone and leaves the ring at full strength.
//
// **Explicitly not `ProgressBar`.** A belt ladder is a discrete ranked sequence, not a
// continuous fill, and 12d is exactly where someone would reach for the primitive.
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { BeltProgressScreen } from './BeltProgressScreen'
import type { LadderRankOut, ParentBeltsClient, StudentBeltOut } from './client'

function rank(over: Partial<LadderRankOut> = {}): LadderRankOut {
  return {
    id: 'r1',
    class_id: 'c1',
    name: 'לבנה',
    kyu: 6,
    order_index: 0,
    color_hex: '#FFFFFF',
    secondary_color_hex: null,
    next_rank_id: 'r2',
    holders: 0,
    ...over,
  }
}

const LADDER: LadderRankOut[] = [
  rank(),
  rank({ id: 'r2', name: 'צהובה', order_index: 1, color_hex: '#F7E017', next_rank_id: 'r3' }),
  rank({ id: 'r3', name: 'כתומה', order_index: 2, color_hex: '#F08A24', next_rank_id: 'r4' }),
  rank({ id: 'r4', name: 'ירוקה', order_index: 3, color_hex: '#2E8B4A', next_rank_id: 'r5' }),
  rank({ id: 'r5', name: 'חומה', order_index: 4, color_hex: '#6F4A2F', next_rank_id: null }),
]

const AWARDS: StudentBeltOut[] = [
  {
    id: 'a1',
    student_id: 's1',
    belt_rank_id: 'r1',
  class_id: 'c1',
    belt_rank_name: 'לבנה',
    color_hex: '#FFFFFF',
    secondary_color_hex: null,
    awarded_on: '2026-01-10',
    awarded_by_person_id: null,
    event_id: null,
    note: null,
  },
  {
    id: 'a2',
    student_id: 's1',
    belt_rank_id: 'r2',
  class_id: 'c1',
    belt_rank_name: 'צהובה',
    color_hex: '#F7E017',
    secondary_color_hex: null,
    awarded_on: '2026-06-04',
    awarded_by_person_id: null,
    event_id: 'x1',
    note: null,
  },
]

function makeClient(awards = AWARDS, ladder = LADDER): ParentBeltsClient {
  return {
    studentBelts: vi
      .fn()
      .mockResolvedValue({ items: awards, next_cursor: null, has_more: false }),
    ladder: vi.fn().mockResolvedValue({ items: ladder, next_cursor: null, has_more: false }),
  } as unknown as ParentBeltsClient
}

function renderScreen(client = makeClient()) {
  render(<BeltProgressScreen classId="c1" client={client} locale="he" studentId="s1" />)
  return client
}

/**
 * A segment of the PROGRESSION strip, not of the history list.
 *
 * Both render a bar per rank, so `getByRole('img', { name: 'לבנה' })` is ambiguous — which
 * is a finding about the markup as much as about the query: two unnamed lists of the same
 * ranks are ambiguous to a screen reader too. The strip carries its own name now.
 */
async function segment(name: string): Promise<HTMLElement> {
  const strip = await screen.findByRole('list', { name: t('he', 'events.belt.progress') })
  return within(strip).getByRole('img', { name })
}

describe('12d — the parent belt view', () => {
  it('rings every segment of the progression, including the current one', async () => {
    renderScreen()
    const bars = await screen.findAllByRole('img')
    const segments = bars.filter((el) => el.classList.contains('studio-belt-bar'))
    expect(segments.length).toBeGreaterThanOrEqual(5)
    for (const segment of segments) {
      expect(segment.style.boxShadow).toContain('var(--belt-ring)')
    }
  })

  it('fades a future segment by its FILL and never by its ring', async () => {
    renderScreen()
    // A future rank: the fill carries alpha, the ring does not.
    //
    // Asserted as an alpha channel rather than as an 8-digit hex: jsdom normalises
    // `#F08A2459` to `rgba(240, 138, 36, 0.35)`, so matching the literal spelling would be
    // testing the serialiser rather than the fade.
    const future = await segment('כתומה')
    expect(future.style.background).toMatch(/rgba\([^)]+,\s*0?\.\d+\)/)
    expect(future.style.boxShadow).toContain('var(--belt-ring)')
  })

  it('leaves an earned segment at full strength', async () => {
    renderScreen()
    const earned = await segment('לבנה')
    // No alpha channel at all — an earned rank is solid.
    expect(earned.style.background).not.toMatch(/rgba\(/)
  })

  it('marks the current rank by more than height', async () => {
    // The canvas distinguishes it by height alone — no ring, no marker, no label. A
    // difference that is only a size is not available to a screen reader at all.
    renderScreen()
    const current = await segment('צהובה')
    expect(current.closest('[aria-current]')).not.toBeNull()
    // And the two neighbours are not marked, so `aria-current` names ONE step.
    expect((await segment('לבנה')).closest('[aria-current]')).toBeNull()
    expect((await segment('כתומה')).closest('[aria-current]')).toBeNull()
  })

  it('is not a ProgressBar', async () => {
    const { container } = render(
      <BeltProgressScreen classId="c1" client={makeClient()} locale="he" studentId="s1" />,
    )
    await screen.findAllByRole('img')
    expect(container.querySelector('.studio-progress')).toBeNull()
  })

  it('renders the no-belt-yet state a new white-belt child is in', async () => {
    // 12d finding 8 — not drawn, and it is the common case for a new child.
    renderScreen(makeClient([]))
    expect(await screen.findByText(t('he', 'events.belt.none'))).toBeInTheDocument()
  })

  it('states eligibility as rank and tenure and never as attendance', async () => {
    // 12d finding 2 — the canvas states "92% נוכחות" to a PARENT, as a fact about their
    // child, and §5.9 has no such criterion. Fifth artboard to add it, first to a parent.
    renderScreen()
    await screen.findAllByRole('img')
    expect(screen.queryByText(/%/)).toBeNull()
    expect(screen.queryByText(/נוכחות/)).toBeNull()
  })

  it('promises no belt hand-over', async () => {
    // 12d finding 1 — the footer claims a promotion enqueues a physical belt for delivery.
    // Three artboards describe that flow and none has a model or a notification kind.
    renderScreen()
    await screen.findAllByRole('img')
    expect(screen.queryByText(/תור המסירה|מסירה/)).toBeNull()
  })

  it('lists the rank history oldest first', async () => {
    // 12d finding 5 — "previous exams" and "rank history" are different lists, and
    // belt.awardOutsideExam proves it: a promotion can happen without an exam. This is the
    // HISTORY, so it carries both, in the order they happened.
    renderScreen()
    const history = await screen.findByRole('list', {
      name: t('he', 'events.belt.history'),
    })
    const items = within(history).getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('לבנה')
    expect(items[1]).toHaveTextContent('צהובה')
  })
})
