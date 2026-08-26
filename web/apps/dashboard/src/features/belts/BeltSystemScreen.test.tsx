// Artboard 5b — מערכת חגורות, where the belt system is defined.
//
// **This is the screen that polices D7 hardest**, because it is the artboard that defines
// what a belt is. On the canvas two of six swatches carry a ring — the white one and the
// white half of a bi-colour one — and both are a translucent tint rather than the solid
// foreground D7 specifies. Yellow, orange, green, brown and the bi-colour-without-white are
// bare. The instinct (ring the ones that would otherwise vanish) is understandable and is
// not the rule: D7 is unconditional, and D12 adds that brown and green fail against the
// dark ground too — five belts across the two modes, not the three the light-mode audit
// happened to name.
//
// **The colour picker is a bounded grid, not a hex field** (D1). A studio choosing an
// arbitrary hex is what D1 forbids for brand; a belt colour is per-class data (D3), and a
// bounded palette is what keeps it auditable. Keep the bound; do not add a hex field later.
//
// **Kyu has two keys and no field on the canvas.** `belt.kyuOptional` was written
// deliberately, so the field ships.
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { BeltSystemScreen } from './BeltSystemScreen'
import type { DashboardBeltsClient, LadderRankOut } from './client'

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
  rank({ id: 'r2', name: 'צהובה', kyu: 5, order_index: 1, color_hex: '#F7E017', next_rank_id: 'r3' }),
  rank({ id: 'r3', name: 'כתומה', kyu: 4, order_index: 2, color_hex: '#F08A24', next_rank_id: 'r4' }),
  rank({ id: 'r4', name: 'ירוקה', kyu: 3, order_index: 3, color_hex: '#2E8B4A', next_rank_id: 'r5' }),
  rank({ id: 'r5', name: 'חומה', kyu: 2, order_index: 4, color_hex: '#6F4A2F', next_rank_id: 'r6' }),
  rank({
    id: 'r6',
    name: 'צהובה-כתומה',
    kyu: 1,
    order_index: 5,
    color_hex: '#F7E017',
    secondary_color_hex: '#F08A24',
    next_rank_id: null,
    holders: 3,
  }),
]

function makeClient(ladder = LADDER): DashboardBeltsClient {
  return {
    ladder: vi.fn().mockResolvedValue({ items: ladder, next_cursor: null, has_more: false }),
    createRank: vi.fn().mockResolvedValue(ladder[0]),
    updateRank: vi.fn().mockResolvedValue(ladder[0]),
    deleteRank: vi.fn().mockResolvedValue(undefined),
    reorder: vi.fn().mockResolvedValue({ items: ladder, next_cursor: null, has_more: false }),
    presets: vi.fn().mockResolvedValue({ items: [], next_cursor: null, has_more: false }),
    seed: vi.fn(),
  } as unknown as DashboardBeltsClient
}

function renderScreen(client = makeClient()) {
  render(<BeltSystemScreen classId="c1" client={client} locale="he" />)
  return client
}

/**
 * The row whose rank NAME is exactly this.
 *
 * Not `getByRole('row', { name: /צהובה/ })`: a row's accessible name is all of its cell
 * text joined, so that regex matches both צהובה and צהובה-כתומה. And `\b` is no help --
 * JS word boundaries are ASCII-only, so they do not fire between Hebrew letters at all.
 * The rowheader is the one cell holding the name alone, and a string matcher is exact.
 */
async function rowFor(name: string): Promise<HTMLElement> {
  const header = await screen.findByRole('rowheader', { name })
  return header.closest('tr') as HTMLElement
}

describe('5b — the belt system', () => {
  it('rings every swatch in the table, with no opt-out anywhere', async () => {
    renderScreen()
    const bars = await screen.findAllByRole('img')
    expect(bars).toHaveLength(6)
    for (const bar of bars) {
      expect(bar).toHaveClass('studio-belt-bar')
      // The ring is BeltBar's own inline box-shadow. Asserted on every bar, not a sample:
      // the canvas's mistake was applying it by eye.
      expect(bar.style.boxShadow).toContain('var(--belt-ring)')
    }
  })

  it('renders a bi-colour rank as one bar with two colours, never as two bars', async () => {
    // app/models/belts.py: "a second bar is how the fill-only bug D7 exists to prevent
    // comes back". One bar, one gradient.
    renderScreen()
    const bar = await screen.findByRole('img', { name: /צהובה-כתומה/ })
    expect(bar.style.background).toContain('linear-gradient')
    // D10 — never a hard-coded physical direction. BeltBar splits on the block axis, which
    // is the same in both writing modes.
    expect(bar.style.background).not.toContain('to right')
    expect(bar.style.background).not.toContain('to left')
  })

  it('offers a bounded palette and no free hex input', async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: t('he', 'events.belt.add') }))
    expect(
      screen.getByRole('radiogroup', { name: t('he', 'events.belt.color') }),
    ).toBeInTheDocument()
    // D1 — an arbitrary hex is exactly what a bounded picker exists to prevent.
    expect(screen.queryByPlaceholderText(/#/)).toBeNull()
  })

  it('has a kyu field, because belt.kyuOptional was written on purpose', async () => {
    renderScreen()
    await userEvent.click(await screen.findByRole('button', { name: t('he', 'events.belt.add') }))
    expect(screen.getByLabelText(t('he', 'events.belt.kyu'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'events.belt.kyuOptional'))).toBeInTheDocument()
  })

  it('refuses to delete a rank students hold, and says how many', async () => {
    // 5b finding 7 — no delete confirmation on a row that shows a student count. The count
    // is the data to refuse with; student_belt.belt_rank_id is ON DELETE RESTRICT.
    const client = renderScreen()
    const row = await rowFor('צהובה-כתומה')
    await userEvent.click(
      within(row).getByRole('button', { name: t('he', 'events.belt.delete') }),
    )
    expect(screen.getByText(t('he', 'events.belt.deleteHeld'))).toBeInTheDocument()
    expect(client.deleteRank).not.toHaveBeenCalled()
  })

  it('deletes a rank nobody holds', async () => {
    const client = renderScreen()
    const row = await rowFor('לבנה')
    await userEvent.click(
      within(row).getByRole('button', { name: t('he', 'events.belt.delete') }),
    )
    expect(client.deleteRank).toHaveBeenCalledWith('r1')
  })

  it('reorders with buttons and posts the whole finished order', async () => {
    // There is no drag primitive and no shared drag utility, so the rows move with buttons
    // over `order_index` — the column that exists. Either way the WRITE is the whole list:
    // a pairwise swap through uq_belt_rank_class_order passes through a colliding state.
    const client = renderScreen()
    const row = await rowFor('צהובה')
    await userEvent.click(
      within(row).getByRole('button', { name: t('he', 'events.belt.moveUp') }),
    )
    expect(client.reorder).toHaveBeenCalledWith('c1', [
      'r2',
      'r1',
      'r3',
      'r4',
      'r5',
      'r6',
    ])
  })

  it('does not offer to move the first rank up or the last one down', async () => {
    renderScreen()
    const first = await rowFor('לבנה')
    expect(
      within(first).queryByRole('button', { name: t('he', 'events.belt.moveUp') }),
    ).toBeNull()
    const last = await rowFor('צהובה-כתומה')
    expect(
      within(last).queryByRole('button', { name: t('he', 'events.belt.moveDown') }),
    ).toBeNull()
  })

  it('renders the empty state a studio is in before the wizard runs', async () => {
    renderScreen(makeClient([]))
    expect(await screen.findByText(t('he', 'events.belt.empty'))).toBeInTheDocument()
  })

  it('states no attendance threshold and no tenure minimum', async () => {
    // 5b finding 1 — the canvas gives the table a ותק מינימלי column and a נוכחות מינימלית
    // column. Neither has a belt_rank column to be stored in, and §5.9 computes eligibility
    // from rank and time held. A per-rank threshold is a model change, not a UI one.
    renderScreen()
    await screen.findByRole('table')
    expect(screen.queryByText(/נוכחות/)).toBeNull()
    expect(screen.queryByText(/%/)).toBeNull()
  })
})
