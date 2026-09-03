// The staff schedule vertical's router, so App.tsx needs one branch and not three.
import { useEffect, useState } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ScheduleSection, staffScheduleRoute } from './ScheduleSection'
import type { StaffScheduleClient } from './client'

function stub(): StaffScheduleClient {
  return {
    listSessions: vi.fn(async () => []),
    listTrainingYears: vi.fn(async () => []),
  } as unknown as StaffScheduleClient
}

/**
 * `hash` is a prop, and `App.tsx` is what keeps it in step with `location`. A test that
 * pins it to a literal can never observe a navigation, so the one test that navigates
 * renders through a harness doing exactly what App does and nothing more.
 */
function Harness({ initial }: { initial: string }) {
  const [hash, setHash] = useState(initial)
  useEffect(() => {
    const onChange = () => setHash(globalThis.location?.hash ?? '')
    globalThis.addEventListener('hashchange', onChange)
    return () => globalThis.removeEventListener('hashchange', onChange)
  }, [])
  return <ScheduleSection locale="he" client={stub()} hash={hash} today="2026-11-03T12:00:00Z" />
}

describe('staffScheduleRoute', () => {
  it('reads #/schedule as היום and #/schedule/date as the picker', () => {
    expect(staffScheduleRoute('#/schedule')).toBe('today')
    expect(staffScheduleRoute('#/schedule/date')).toBe('date')
  })

  it('falls back to היום rather than to a blank page', () => {
    // The same rule the dashboard applies: an unknown hash resolves to something, because
    // a coach who mistypes a URL on a phone gets a screen and not a void.
    expect(staffScheduleRoute('#/nonsense')).toBe('today')
    expect(staffScheduleRoute('')).toBe('today')
  })
})

describe('ScheduleSection (staff)', () => {
  it('draws 9a/1d היום on the schedule route', async () => {
    render(
      <ScheduleSection
        locale="he"
        client={stub()}
        hash="#/schedule"
        today="2026-11-03T12:00:00Z"
      />,
    )
    await waitFor(() => expect(screen.getByTestId('staff-today')).toBeInTheDocument())
  })

  it('draws 9b on the date route', async () => {
    render(
      <ScheduleSection
        locale="he"
        client={stub()}
        hash="#/schedule/date"
        today="2026-11-03T12:00:00Z"
      />,
    )
    expect(
      await screen.findByRole('heading', { name: t('he', 'schedule.datePicker.title') }),
    ).toBeInTheDocument()
  })

  it('offers a way from היום to the date picker', async () => {
    // 9b is reachable or it is not delivered. INVENTORY calls it "בחירת תאריך — יומן מלא,
    // טווח, קפיצה", which is a screen a coach opens from the day strip.
    render(
      <ScheduleSection
        locale="he"
        client={stub()}
        hash="#/schedule"
        today="2026-11-03T12:00:00Z"
      />,
    )
    const open = await screen.findByTestId('open-date-picker')
    expect(open).toHaveAccessibleName()
    expect(open).toHaveAttribute('href', '#/schedule/date')
  })

  it('returns to היום on the day a coach picks', async () => {
    globalThis.location.hash = '#/schedule/date'
    render(<Harness initial="#/schedule/date" />)

    // One tap. 9b calls back on the day itself — `apply-range` is the separate from/to
    // flow, and by the time it would be clicked the picker has already unmounted.
    await userEvent.click(await screen.findByTestId('day-2026-11-10'))

    await waitFor(() => expect(screen.getByTestId('staff-today')).toBeInTheDocument())
    // The picked day wins over the clock, which is what "קפיצה" on 9b is for.
    expect(screen.getByTestId('day-chip-2026-11-10')).toHaveAttribute('aria-current', 'date')
  })

  it('uses no physical CSS', async () => {
    const { container } = render(
      <ScheduleSection
        locale="he"
        client={stub()}
        hash="#/schedule"
        today="2026-11-03T12:00:00Z"
      />,
    )
    await screen.findByTestId('staff-today')
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
