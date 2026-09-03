// Parent artboard 1a — the BASE home, 390×844, light and dark.
//
// The design pass reshaped this file to the artboard's own order: alert cards, lessons
// grouped by day, child filter chips. The tab bar moved to the App shell (1a draws it on
// every screen), so its tests live beside the shell now. 2a (day strip, past attendance)
// is still deliberately unbuilt — the last test keeps it from creeping in.
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import { DIRECTION, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { THEME_STORAGE_KEY, ThemeProvider } from '@studio/ui'
import type { ResolvedTheme } from '@studio/ui'
import { ParentHome } from './ParentHome'
import { makeIntentClient } from './intentClient'

/** The card only renders when it can write; these tests are about the arrangement. */
const STUB_CLIENT = makeIntentClient(async () => new Response(null, { status: 204 }))

const DIRECTIONS = [
  { locale: 'he', dir: 'rtl' },
  { locale: 'en', dir: 'ltr' },
] as const satisfies readonly { locale: Locale; dir: 'rtl' | 'ltr' }[]

const THEMES = ['light', 'dark'] as const

const CHILDREN = [
  { id: 'st1', displayName: 'נועה לוי', firstName: 'נועה', groupNames: ['מתחילים'], beltColorHex: '#d9a800' },
  { id: 'st2', displayName: 'איתי לוי', firstName: 'איתי', groupNames: ['מתקדמים', 'נבחרת'], beltColorHex: null },
]

/**
 * RELATIVE to now, and that is a bug fix rather than a style choice. These were two
 * hardcoded 2026 dates, and the screen only ever lists lessons still to come — so the
 * day the calendar passed them, five tests here began failing and stayed failing. A
 * fixture pinned to a wall clock is a test with an expiry date on it.
 */
const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString()

const LESSONS = [
  { id: 'se1', startsAt: inHours(2), endsAt: inHours(3), groupName: 'מתחילים', locationName: 'אולם א׳' },
  { id: 'se2', startsAt: inHours(26), endsAt: inHours(27), groupName: 'מתקדמים', locationName: null },
]

function renderIn(
  ui: ReactElement,
  { locale = 'he', theme = 'light' }: { locale?: Locale; theme?: ResolvedTheme } = {},
) {
  globalThis.localStorage?.setItem(THEME_STORAGE_KEY, theme)
  document.documentElement.lang = locale
  document.documentElement.dir = DIRECTION[locale]
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

describe('ParentHome', () => {
  it('names the region without printing a heading on it', () => {
    // Owner, 2026-09-01: the visible "הילדים שלי" title went, along with the settings
    // gear beside it. The app bar above already names where you are, and the gear was a
    // second door to `#/profile` a thumb's width from the profile TAB.
    //
    // The NAME did not go — a region a screen reader cannot identify is a different
    // defect from a heading nobody needs to read.
    render(<ParentHome locale="he" />)
    expect(screen.getByTestId('parent-home')).toHaveAccessibleName(t('he', 'common.home.title'))
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    expect(screen.queryByTestId('parent-home-settings')).toBeNull()
  })

  it('raises the debt alert with its CTA when the family owes money', async () => {
    // The owner's Option B (2026-09-01) turned this from a card into a STRIP: three
    // surfaces already show this number, and on home its job is to be noticed rather
    // than to be the largest thing on the screen. Still a real 44px control, and now a
    // link — it navigates to the payments tab rather than acting in place.
    render(<ParentHome locale="he" students={CHILDREN} upcoming={LESSONS} debtAgorot={32000} />)
    const strip = screen.getByTestId('parent-home-debt')
    expect(strip).toHaveTextContent(t('he', 'common.home.debt.title'))
    const cta = screen.getByTestId('parent-home-debt-cta')
    expect(cta).toHaveTextContent(t('he', 'common.home.debt.cta'))
    expect(cta).toHaveAttribute('href', '#/payments')
    expect(screen.queryByTestId('parent-home-no-alerts')).toBeNull()
  })

  it('says nothing needs attention when nothing does', () => {
    render(<ParentHome locale="he" students={CHILDREN} upcoming={[]} />)
    expect(screen.getByTestId('parent-home-no-alerts')).toHaveTextContent(
      t('he', 'common.home.noAlerts'),
    )
  })

  it('leads with the next lesson and its two-way answer', () => {
    // Option B's whole point: the soonest lesson answers the screen's question at full
    // size, and the answer to "does anything need me" is ON it rather than three taps
    // away behind #/absence.
    render(
      <ParentHome
        locale="he"
        students={CHILDREN}
        upcoming={LESSONS}
        intentClient={STUB_CLIENT}
      />,
    )
    const card = screen.getByTestId('parent-home-next-lesson')
    expect(card).toHaveTextContent('נועה')
    expect(within(card).getByTestId('intent-coming')).toBeInTheDocument()
    expect(within(card).getByTestId('intent-not-coming')).toBeInTheDocument()
  })

  it('names the child by their first name, not their full one', () => {
    // Three "… לוי" surnames in one column identify nobody, which is the defect the
    // belt bar and the first name together are for.
    render(
      <ParentHome locale="he" students={CHILDREN} upcoming={LESSONS} intentClient={STUB_CLIENT} />,
    )
    expect(screen.getByTestId('parent-home-next-lesson')).not.toHaveTextContent('נועה לוי')
  })

  it('lists the rest of the week as rows, each carrying its own day', () => {
    // The day-grouped cards and the seven-day strip are gone: the day sits on each
    // row's leading edge, which is what lets the screen fit 844px again.
    render(<ParentHome locale="he" students={CHILDREN} upcoming={LESSONS} />)
    const rows = screen.getAllByTestId('parent-home-lesson')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]).toHaveTextContent('מתחילים')
  })

  it('shows only lessons a child of this family actually attends', () => {
    // `GET /sessions` hands a parent who ALSO coaches the whole studio, so the screen
    // filters to the family's own groups. Without it a coaching parent saw the club's
    // entire timetable on their family's home screen.
    render(
      <ParentHome
        locale="he"
        students={CHILDREN}
        upcoming={[...LESSONS, { id: 'se9', startsAt: inHours(4), groupName: 'קבוצה זרה' }]}
      />,
    )
    const rows = screen.getAllByTestId('parent-home-lesson')
    expect(rows.some((row) => row.textContent?.includes('קבוצה זרה'))).toBe(false)
  })

  it('filters the week through the child chips, and releases on a second tap', async () => {
    render(<ParentHome locale="he" students={CHILDREN} upcoming={LESSONS} />)
    const before = screen.getAllByTestId('parent-home-lesson').length
    await userEvent.click(screen.getByRole('button', { name: 'נועה' }))
    const filtered = screen.getAllByTestId('parent-home-lesson')
    expect(filtered.length).toBeLessThan(before)
    expect(filtered.every((row) => row.textContent?.includes('מתחילים'))).toBe(true)
    await userEvent.click(screen.getByRole('button', { name: 'נועה' }))
    expect(screen.getAllByTestId('parent-home-lesson')).toHaveLength(before)
  })

  it('puts the family filter ABOVE the week it filters', () => {
    // It used to be the last thing on a screen titled "my children" — a control that
    // partitioned everything above it, placed below all of it.
    render(<ParentHome locale="he" students={CHILDREN} upcoming={LESSONS} />)
    const chips = screen.getByTestId('parent-home-chip-all')
    const week = screen.getAllByTestId('parent-home-lesson')[0]!
    expect(chips.compareDocumentPosition(week) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('skips the family layer for a family with one child', () => {
    // §19.3 gives `dev+parent1` exactly one job — "the single-child path that skips the
    // family layer" — and the layer was not skipped: a parent of one child got an "הכל"
    // chip and a chip naming their only child, a filter with one thing to filter and
    // nothing to filter it from.
    render(<ParentHome locale="he" students={[CHILDREN[0]!]} upcoming={LESSONS} />)
    expect(screen.queryByTestId('parent-home-chip-all')).toBeNull()
    // The way to the child's card survives — it is the row's point, not the filter's.
    expect(screen.getByTestId(`parent-home-card-${CHILDREN[0]!.id}`)).toBeInTheDocument()
  })

  it('keeps the family layer for a family with more than one child', () => {
    render(<ParentHome locale="he" students={CHILDREN} upcoming={LESSONS} />)
    expect(screen.getByTestId('parent-home-chip-all')).toBeInTheDocument()
  })

  it('tells a parent with no children why the screen is empty', () => {
    render(<ParentHome locale="he" students={[]} upcoming={[]} />)
    expect(screen.getByText(t('he', 'common.home.noChildren'))).toBeInTheDocument()
  })

  it('explains an empty week rather than showing a blank box', () => {
    render(<ParentHome locale="he" students={CHILDREN} upcoming={[]} />)
    expect(screen.getByText(t('he', 'common.home.noUpcoming'))).toBeInTheDocument()
    expect(screen.getByText(t('he', 'common.home.noUpcomingWeek'))).toBeInTheDocument()
  })

  it.each(DIRECTIONS)('renders in $locale ($dir) with no physical CSS', ({ locale }) => {
    const { container } = renderIn(<ParentHome locale={locale} students={CHILDREN} upcoming={LESSONS} />, { locale })
    const styles = [...container.querySelectorAll<HTMLElement>('[style]')].map(
      (node) => node.getAttribute('style') ?? '',
    )
    for (const style of styles) {
      expect(style).not.toMatch(/margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/)
    }
  })

  it.each(THEMES)('renders in %s, per 1a being drawn בהיר + כהה', (theme) => {
    const { container } = renderIn(<ParentHome locale="he" />, { theme })
    expect(container.querySelector('[data-testid="parent-home"]')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', theme)
  })
})

describe('register §3.8 — a lesson that already started stays offered for hours', () => {
  // The staff app's calendar has `useToday.ts`, a 60s poll that re-stamps the clock this
  // screen reads. This screen has no such thing: `nextLesson` recomputes from `new Date()`
  // on every RENDER, but nothing was making it render again after mount — so a family
  // that opened the app once at 16:00 still saw the 16:00 class as "coming", offering
  // מגיע/ה · לא מגיע/ה, at 20:43 for a lesson that finished four hours earlier.
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('withdraws the next-lesson card once its start time has passed, without a remount', () => {
    const now = Date.now()
    vi.setSystemTime(now)
    const soon = { id: 'soon', startsAt: new Date(now + 60_000).toISOString(), groupName: 'מתחילים' }
    render(
      <ParentHome locale="he" students={CHILDREN} upcoming={[soon]} intentClient={STUB_CLIENT} />,
    )
    expect(screen.getByTestId('parent-home-next-lesson')).toBeInTheDocument()

    // The lesson starts (and, realistically, ends) — no prop changes, only time passing.
    act(() => vi.setSystemTime(now + 5 * 3600_000))
    act(() => vi.advanceTimersByTime(70_000))

    expect(screen.queryByTestId('parent-home-next-lesson')).toBeNull()
  })
})
