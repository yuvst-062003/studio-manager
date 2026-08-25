// The closure calendar, reached from 4b and 6a — and E2E-5's third scenario.
//
// §5.6, the rule the whole screen turns on: Israeli holidays are "**proposals the manager
// ticks, never automatic closures**. Nothing is closed automatically — studios differ, and
// a wrong guess deletes real lessons."
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { ClosuresPanel } from './ClosuresPanel'
import type { Closure, HolidayPreset, ScheduleClient } from './client'

const PRESETS: HolidayPreset[] = [
  { key: 'yom_kippur', name: 'יום כיפור', date_from: '2026-09-21', date_to: '2026-09-21' },
  { key: 'sukkot', name: 'סוכות', date_from: '2026-09-26', date_to: '2026-10-03' },
  { key: 'summer_break', name: 'חופש גדול', date_from: '2026-07-01', date_to: '2026-08-31' },
]

const EXISTING: Closure[] = [
  {
    id: 'c1',
    training_year_id: 'y1',
    date_from: '2026-12-25',
    date_to: '2026-12-25',
    reason: 'שיפוץ',
    source: 'manual',
  },
]

function stub(overrides: Partial<ScheduleClient> = {}): ScheduleClient {
  return {
    listSessions: vi.fn(async () => []),
    getSchedule: vi.fn(async () => []),
    putSchedule: vi.fn(),
    listTrainingYears: vi.fn(async () => []),
    listClosures: vi.fn(async () => EXISTING),
    createClosure: vi.fn(async () => ({ sessions_cancelled: 0 })),
    listHolidayPresets: vi.fn(async () => PRESETS),
    ...overrides,
  } as unknown as ScheduleClient
}

function renderPanel(client = stub(), locale: 'he' | 'en' = 'he') {
  render(<ClosuresPanel locale={locale} client={client} trainingYearId="y1" year={2026} />)
  return client
}

async function openPresets() {
  await userEvent.click(screen.getByTestId('holiday-presets'))
  await waitFor(() => expect(screen.getAllByTestId('preset-day').length).toBeGreaterThan(0))
}

describe('ClosuresPanel', () => {
  it('lists the closures the studio has already declared, with their source', async () => {
    renderPanel()
    expect(await screen.findByText('שיפוץ')).toBeInTheDocument()
    expect(screen.getByText(t('he', 'schedule.closure.source.manual'))).toBeInTheDocument()
  })

  it('says there are no closures rather than showing an empty list', async () => {
    renderPanel(stub({ listClosures: vi.fn(async () => []) }))
    expect(await screen.findByText(t('he', 'schedule.closure.empty'))).toBeInTheDocument()
  })

  it('offers a preset per §5.6 holiday, and every one of them starts unticked', async () => {
    // E2E-5 asserts exactly this. A preset that arrived ticked would be a closure applied
    // on the manager's behalf, which is the thing §5.6 forbids in as many words.
    renderPanel()
    await openPresets()
    for (const box of screen.getAllByTestId('preset-day')) {
      expect(box).not.toBeChecked()
    }
  })

  it('labels a preset from its key rather than from the server’s Hebrew', async () => {
    // D-M2-4 — HolidayPresetOut carries `name` as a fallback; the screen renders t().
    renderPanel(stub(), 'en')
    await openPresets()
    expect(screen.getByLabelText(/Yom Kippur/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/יום כיפור/)).toBeNull()
  })

  it('creates one closure per ticked preset, and none for the rest', async () => {
    const client = renderPanel()
    await openPresets()
    await userEvent.click(screen.getAllByTestId('preset-day')[0] as HTMLElement)
    await userEvent.click(screen.getByTestId('apply-presets'))

    await waitFor(() => expect(client.createClosure).toHaveBeenCalledTimes(1))
    expect(client.createClosure).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'holiday_preset', training_year_id: 'y1' }),
    )
  })

  it('refuses to apply nothing, with a message rather than a silent no-op', async () => {
    const client = renderPanel()
    await openPresets()
    await userEvent.click(screen.getByTestId('apply-presets'))
    expect(await screen.findByText(t('he', 'schedule.closure.preset.none'))).toBeInTheDocument()
    expect(client.createClosure).not.toHaveBeenCalled()
  })

  it('reports how many sessions the closure cancelled', async () => {
    // §5.6 makes that consequence the manager's to see immediately — they have just closed
    // a fortnight and need to know what it cost before they navigate away.
    const client = stub({ createClosure: vi.fn(async () => ({ sessions_cancelled: 7 })) })
    renderPanel(client)
    await openPresets()
    await userEvent.click(screen.getAllByTestId('preset-day')[0] as HTMLElement)
    await userEvent.click(screen.getByTestId('apply-presets'))
    expect(await screen.findByText(/7/)).toBeInTheDocument()
  })

  it('adds a manual range with a reason, sourced as manual', async () => {
    const client = renderPanel()
    await userEvent.type(screen.getByTestId('closure-from'), '2027-01-05')
    await userEvent.type(screen.getByTestId('closure-to'), '2027-01-07')
    await userEvent.type(screen.getByTestId('closure-reason'), 'שיפוץ האולם')
    await userEvent.click(screen.getByTestId('add-closure'))

    await waitFor(() => expect(client.createClosure).toHaveBeenCalled())
    expect(client.createClosure).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'manual',
        date_from: '2027-01-05',
        date_to: '2027-01-07',
        reason: 'שיפוץ האולם',
      }),
    )
  })

  it('refuses a range that ends before it starts, before asking the server', async () => {
    const client = renderPanel()
    await userEvent.type(screen.getByTestId('closure-from'), '2027-01-07')
    await userEvent.type(screen.getByTestId('closure-to'), '2027-01-05')
    await userEvent.type(screen.getByTestId('closure-reason'), 'הפוך')
    await userEvent.click(screen.getByTestId('add-closure'))

    expect(await screen.findByText(t('he', 'schedule.closure.endBeforeStart'))).toBeInTheDocument()
    expect(client.createClosure).not.toHaveBeenCalled()
  })

  it('refuses a range with no reason', async () => {
    // studio_closure.reason is non-null, and "closed" with no explanation is what a parent
    // sees when they ask why.
    const client = renderPanel()
    await userEvent.type(screen.getByTestId('closure-from'), '2027-01-05')
    await userEvent.type(screen.getByTestId('closure-to'), '2027-01-05')
    await userEvent.click(screen.getByTestId('add-closure'))
    expect(client.createClosure).not.toHaveBeenCalled()
  })

  it('gives every checkbox a label and the preset list a legend', async () => {
    renderPanel()
    await openPresets()
    expect(screen.getByRole('group')).toHaveAccessibleName(
      t('he', 'schedule.closure.preset.subtitle'),
    )
    for (const box of screen.getAllByTestId('preset-day')) {
      expect(box).toHaveAccessibleName()
    }
  })

  it('phrases the presets as an offer, never as a statement that the club is closed', async () => {
    renderPanel()
    await openPresets()
    expect(screen.getByText(t('he', 'schedule.closure.preset.subtitle'))).toBeInTheDocument()
  })

  it.each(['he', 'en'] as const)('renders in %s with no physical CSS', async (locale) => {
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    const { container } = render(
      <ClosuresPanel locale={locale} client={stub()} trainingYearId="y1" year={2026} />,
    )
    await screen.findByTestId('holiday-presets')
    for (const node of container.querySelectorAll<HTMLElement>('[style]')) {
      expect(node.getAttribute('style') ?? '').not.toMatch(
        /margin-(left|right)|padding-(left|right)|(^|;)\s*(left|right):/,
      )
    }
  })
})
