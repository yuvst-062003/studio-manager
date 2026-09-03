import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearSlot, registerSlot } from '@studio/ui'
import { DIRECTION } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { RosterRow as RosterRowData } from '@studio/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RosterRow, nextStatus } from './RosterRow'
import type { RosterRowSectionProps } from './RosterRow'

/** SPEC §13 — "every component rendered in both `he` (RTL) and `en` (LTR)". `@studio/ui`'s
 *  own `testing.tsx` is deliberately not exported from the package (it pulls in
 *  @testing-library/react, which must never reach an app bundle), so an app-side test sets
 *  the direction on the document the same way the provider does. */
const DIRECTIONS = [
  { locale: 'he' as Locale, dir: 'rtl' },
  { locale: 'en' as Locale, dir: 'ltr' },
]

function renderIn(ui: React.ReactElement, { locale = 'he' as Locale } = {}) {
  document.documentElement.lang = locale
  document.documentElement.dir = DIRECTION[locale]
  return render(ui)
}

const row = (overrides: Partial<RosterRowData> = {}): RosterRowData => ({
  student_id: 'student-1',
  display_name: 'דנה כהן',
  belt_color_hex: null,
  belt_name: null,
  health_status: 'missing',
  derived_flags: {},
  status: 'unmarked',
  source: null,
  has_absence_report: false,
  absence_reason: null,
  ...overrides,
})

afterEach(() => clearSlot('roster-row'))

describe('the roster-row container', () => {
  it('renders every registered section and names none of them', async () => {
    // Plan §1.3 seam 4. M4's health badge and M7's belt bar are `registerSlot` files in
    // their own directories; this container must render them without importing them.
    registerSlot<RosterRowSectionProps>('roster-row', {
      key: 'health',
      order: 10,
      render: () => <span data-testid="section-health" />,
    })
    registerSlot<RosterRowSectionProps>('roster-row', {
      key: 'belt',
      order: 20,
      render: () => <span data-testid="section-belt" />,
    })

    renderIn(<RosterRow locale="he" onCycle={vi.fn()} row={row()} />)

    expect(screen.getByTestId('section-health')).toBeInTheDocument()
    expect(screen.getByTestId('section-belt')).toBeInTheDocument()
  })

  it('renders with no sections at all', () => {
    // M4 and M7 land later, and the roster is the screen a coach uses today. A container
    // that needed its sections would be a container that could not ship first.
    renderIn(<RosterRow locale="he" onCycle={vi.fn()} row={row()} />)
    expect(screen.getByText('דנה כהן')).toBeInTheDocument()
  })

  it('passes each section the roster row, including the two seam fields', () => {
    // The container never reads `health_status` or `derived_flags` — it hands them on. That
    // is the seam: M4 populates, M5 renders, neither opens the other's file.
    const seen: RosterRowSectionProps[] = []
    registerSlot<RosterRowSectionProps>('roster-row', {
      key: 'spy',
      order: 10,
      render: (props) => {
        seen.push(props)
        return null
      },
    })

    renderIn(
      <RosterRow
        locale="he"
        onCycle={vi.fn()}
        row={row({ health_status: 'signed', derived_flags: { asthma: true } })}
      />,
    )

    expect(seen[0]?.row.health_status).toBe('signed')
    expect(seen[0]?.row.derived_flags).toEqual({ asthma: true })
  })

  it('does not import anything from the health feature directory', async () => {
    // W3's rule, asserted rather than trusted: "Never open the other lane's file." A
    // container that imported `features/health/HealthBadge` would still render correctly
    // and would have serialized the two lanes.
    // Comments stripped: this file's own docstring names `HealthBadge.tsx` when explaining
    // that the badge arrives through the slot, and a detector that cannot tell a rule from
    // its explanation is a detector nobody can write the explanation for.
    const source = (await import('./RosterRow.tsx?raw')).default
    const executable = source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '')
    expect(executable).not.toContain('features/health')
    expect(executable).not.toContain('HealthBadge')
  })
})

describe('§5.7 — the tap cycle', () => {
  it('cycles unmarked → present → absent_unexcused → unmarked', () => {
    expect(nextStatus('unmarked')).toBe('present')
    expect(nextStatus('present')).toBe('absent_unexcused')
    expect(nextStatus('absent_unexcused')).toBe('unmarked')
  })

  it('reports the next status when a row is tapped', async () => {
    const onCycle = vi.fn()
    renderIn(<RosterRow locale="he" onCycle={onCycle} row={row({ status: 'present' })} />)
    await userEvent.click(screen.getByTestId('roster-row-student-1'))
    expect(onCycle).toHaveBeenCalledWith('absent_unexcused')
  })

  it('does NOT cycle NOR override a parent s pre-report on an ordinary tap', async () => {
    // §5.7 — "an excused absence shows as ✕ with a הודיעו מראש label and requires a
    // long-press to override." A parent told the club this morning; a thumb brushing the
    // list must not erase that. `userEvent.click` is a real pointerdown-then-pointerup
    // pair well under the hold threshold, so this is the "brush" the rule exists for.
    const onCycle = vi.fn()
    const onOverride = vi.fn()
    renderIn(
      <RosterRow
        locale="he"
        onCycle={onCycle}
        onOverride={onOverride}
        row={row({ status: 'absent_excused', has_absence_report: true })}
      />,
    )
    await userEvent.click(screen.getByTestId('roster-row-student-1'))
    expect(onCycle).not.toHaveBeenCalled()
    expect(onOverride).not.toHaveBeenCalled()
  })

  it('overrides a parent s pre-report on a genuine long-press', async () => {
    // The positive case the finding named: a hold past the threshold, not a tap, is what
    // is supposed to reach `onOverride`.
    const onOverride = vi.fn()
    renderIn(
      <RosterRow
        locale="he"
        onCycle={vi.fn()}
        onOverride={onOverride}
        row={row({ status: 'absent_excused', has_absence_report: true })}
      />,
    )
    const target = screen.getByTestId('roster-row-student-1')
    fireEvent.pointerDown(target)
    expect(onOverride).not.toHaveBeenCalled()
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(onOverride).toHaveBeenCalledOnce()
    fireEvent.pointerUp(target)
    // The pointer's own trailing click must not call it a second time.
    fireEvent.click(target)
    expect(onOverride).toHaveBeenCalledOnce()
  })

  it('does not override on a hold released before the threshold', async () => {
    const onOverride = vi.fn()
    renderIn(
      <RosterRow
        locale="he"
        onCycle={vi.fn()}
        onOverride={onOverride}
        row={row({ status: 'absent_excused', has_absence_report: true })}
      />,
    )
    const target = screen.getByTestId('roster-row-student-1')
    fireEvent.pointerDown(target)
    await new Promise((resolve) => setTimeout(resolve, 100))
    fireEvent.pointerUp(target)
    fireEvent.click(target)
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(onOverride).not.toHaveBeenCalled()
  })

  it('lets a keyboard activation override immediately, with no hold', async () => {
    // A hold is a touchscreen-safety concept. A keyboard Enter/Space on a focused button
    // is already a single deliberate action with nothing to brush.
    const onOverride = vi.fn()
    renderIn(
      <RosterRow
        locale="he"
        onCycle={vi.fn()}
        onOverride={onOverride}
        row={row({ status: 'absent_excused', has_absence_report: true })}
      />,
    )
    const target = screen.getByTestId('roster-row-student-1')
    target.focus()
    await userEvent.keyboard('{Enter}')
    expect(onOverride).toHaveBeenCalledOnce()
  })

  it('does cycle an absent_excused row a coach set themselves', async () => {
    // The protection is for the PARENT's notice specifically. A coach who marked a child
    // excused and then changed their mind is correcting their own entry.
    const onCycle = vi.fn()
    renderIn(
      <RosterRow
        locale="he"
        onCycle={onCycle}
        row={row({ status: 'absent_excused', source: 'coach', has_absence_report: false })}
      />,
    )
    await userEvent.click(screen.getByTestId('roster-row-student-1'))
    expect(onCycle).toHaveBeenCalledWith('present')
  })
})

describe('the note line — reason and plan', () => {
  it("shows the parent's own reason beside the pre-reported label", () => {
    // Register follow-up — `absence_reason` reached this row's data long before this test
    // existed; nothing rendered it. A coach saw only "notified in advance" and never why.
    renderIn(
      <RosterRow
        locale="he"
        onCycle={vi.fn()}
        row={row({
          status: 'absent_excused',
          has_absence_report: true,
          absence_reason: 'מחלה',
        })}
      />,
    )
    expect(screen.getByTestId('roster-row-student-1')).toHaveTextContent('מחלה')
  })

  it('shows nothing extra when the parent gave no reason', () => {
    renderIn(
      <RosterRow
        locale="he"
        onCycle={vi.fn()}
        row={row({ status: 'absent_excused', has_absence_report: true, absence_reason: null })}
      />,
    )
    expect(screen.getByTestId('roster-row-student-1')).toHaveTextContent(
      'הודיעו מראש',
    )
  })

  it("shows the student's plan name when one is set", () => {
    renderIn(
      <RosterRow locale="he" onCycle={vi.fn()} row={row({ plan_name: 'פעמיים בשבוע' })} />,
    )
    expect(screen.getByText('פעמיים בשבוע')).toBeInTheDocument()
  })

  it('shows no plan badge when none is chosen', () => {
    renderIn(<RosterRow locale="he" onCycle={vi.fn()} row={row({ plan_name: null })} />)
    expect(screen.queryByTestId('roster-row-student-1')?.querySelector('[data-note="plan"]')).toBeNull()
  })
})

describe('§5.5 — nothing on the mat is ever blocked', () => {
  it('lets a coach mark a student with no health declaration present', async () => {
    // §5.5 — "The roster shows ⚠ and the coach can still mark the student present. There is
    // deliberately no `block_attendance_without_health` setting."
    //
    // `2d` finding 1 is an artboard telling a coach to bench a child over a declaration, and
    // it is the more dangerous of the two because it is on the mat, mid-lesson. This test is
    // the guard against that reading reaching the code.
    const onCycle = vi.fn()
    renderIn(
      <RosterRow locale="he" onCycle={onCycle} row={row({ health_status: 'missing' })} />,
    )
    const target = screen.getByTestId('roster-row-student-1')
    expect(target).toBeEnabled()
    await userEvent.click(target)
    expect(onCycle).toHaveBeenCalledWith('present')
  })
})

describe('accessibility and direction', () => {
  it('is a button, not a div with a click handler', () => {
    // The single most-used control in the product. A div is unreachable by keyboard and
    // invisible to assistive tech.
    renderIn(<RosterRow locale="he" onCycle={vi.fn()} row={row()} />)
    expect(screen.getByTestId('roster-row-student-1').tagName).toBe('BUTTON')
  })

  it('gives the mark an accessible name rather than colour alone', () => {
    // SC 1.4.1. `1c` notes "no accessible name appears on any icon-only element in the
    // export"; `AttendanceMark` requires a label, and this is where that contract is honoured.
    renderIn(<RosterRow locale="he" onCycle={vi.fn()} row={row({ status: 'present' })} />)
    expect(screen.getByLabelText('נוכח')).toBeInTheDocument()
  })

  it('distinguishes absent from notified by more than colour', () => {
    // `9f` finding 4 — "Fill is the only thing separating they didn't come from they told us
    // they wouldn't come." The glyph mapping carries that: one is `absent`, the other
    // `notified`, and they are different shapes as well as different fills.
    const { unmount } = renderIn(
      <RosterRow locale="he" onCycle={vi.fn()} row={row({ status: 'absent_unexcused' })} />,
    )
    expect(document.querySelector('[data-state="absent"]')).toBeInTheDocument()
    unmount()

    renderIn(
      <RosterRow
        locale="he"
        onCycle={vi.fn()}
        row={row({ status: 'absent_excused', has_absence_report: true })}
      />,
    )
    expect(document.querySelector('[data-state="notified"]')).toBeInTheDocument()
  })

  it('isolates the name so a Latin name does not reorder the row', () => {
    renderIn(<RosterRow locale="he" onCycle={vi.fn()} row={row({ display_name: 'Dana Cohen' })} />)
    expect(screen.getByText('Dana Cohen').tagName).toBe('BDI')
  })

  it.each(DIRECTIONS)('renders in $locale', ({ locale }) => {
    // SPEC §13 — "every component rendered in both `he` (RTL) and `en` (LTR)". `1c`'s row
    // order comes from DOM order plus `dir`, with no manual positioning, so this passing in
    // both directions is the evidence that no physical offset crept in.
    renderIn(<RosterRow locale={locale} onCycle={vi.fn()} row={row()} />, { locale })
    expect(screen.getByTestId('roster-row-student-1')).toBeInTheDocument()
  })
})
