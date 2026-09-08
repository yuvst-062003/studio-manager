// #29 — סנכרון יומן, as the owner asked for it on 2026-09-08.
//
// > "Settings → סינכרון יומן opens the old calendar design. Replace it with a popup asking
// > for a date range, then three icon buttons — copy link, add to Google Calendar, add to
// > iOS Calendar."
//
// What it replaces: the row was an `<a href="#/calendar">`, and `#/calendar` is לוח הילד —
// a whole calendar SCREEN with §5.12's subscribe panel (`CalendarSync`, now deleted) below
// it. A parent who tapped "סנכרון יומן" got a calendar to read rather than the two links
// and the copy button they came for.
//
// The three controls are ICON-ONLY, which is why every assertion below finds them by their
// accessible name: an icon with no `aria-label` is a button a screen reader announces as
// nothing at all (`.claude/rules/ui-rtl-a11y.md`).
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { t } from '@studio/i18n'
import { CalendarSyncPopup, rangedFeedUrl } from './CalendarSyncPopup'
import { googleSubscribeUrl, webcalUrl } from '../../comms/commsClient'
import type { ParentCommsClient } from '../../comms/commsClient'

const TODAY = '2026-09-08'

const FEED = {
  id: 'f1',
  subject_type: 'guardian' as const,
  url: 'https://api.example.test/api/v1/calendar/abc.ics',
  rotated_at: null,
}

function feedClient(over: Partial<ParentCommsClient> = {}): ParentCommsClient {
  return {
    calendarFeeds: vi.fn().mockResolvedValue({ feeds: [FEED] }),
    ...over,
  } as unknown as ParentCommsClient
}

function open(over: Partial<Parameters<typeof CalendarSyncPopup>[0]> = {}) {
  return render(
    <CalendarSyncPopup
      locale="he"
      client={feedClient()}
      todayKey={TODAY}
      onClose={vi.fn()}
      {...over}
    />,
  )
}

describe('the סנכרון יומן popup', () => {
  it('asks for a date range before it offers anything', async () => {
    open()
    expect(await screen.findByTestId('calendar-sync-popup')).toBeInTheDocument()
    // Labelled inputs, not bare fields — every input has an associated <label>.
    expect(
      screen.getByLabelText(t('he', 'people.profile.calendarSync.from')),
    ).toHaveValue(TODAY)
    expect(screen.getByLabelText(t('he', 'people.profile.calendarSync.to'))).toBeInTheDocument()
  })

  it('offers exactly three controls, each an icon with a name', async () => {
    open()
    await screen.findByTestId('calendar-sync-popup')

    const copy = screen.getByRole('button', {
      name: t('he', 'people.profile.calendarSync.copy'),
    })
    const google = screen.getByRole('link', {
      name: t('he', 'people.profile.calendarSync.google'),
    })
    const apple = screen.getByRole('link', {
      name: t('he', 'people.profile.calendarSync.apple'),
    })

    // The glyph stays hidden — an un-hidden `<svg>` inside a labelled control is announced
    // twice — but the control is no longer icon-ONLY. A generic calendar glyph for Google
    // and a phone glyph for iOS told a sighted reader nothing about which was which (owner,
    // 2026-09-08), so each carries a short visible name too.
    for (const control of [copy, google, apple]) {
      expect(control).toHaveAttribute('aria-label')
      expect(control.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }

    expect(google).toHaveTextContent(t('he', 'people.profile.calendarSync.googleShort'))
    expect(apple).toHaveTextContent(t('he', 'people.profile.calendarSync.appleShort'))
    expect(copy).toHaveTextContent(t('he', 'people.profile.calendarSync.copyShort'))

    // WCAG 2.5.3 (label in name): a voice-control user who says what they can SEE must hit
    // the control they meant. The visible name has to be inside the accessible one, not
    // merely near it — 'Google' and 'iOS' are what distinguishes these two at all.
    for (const [control, short] of [
      [google, 'googleShort'],
      [apple, 'appleShort'],
      [copy, 'copyShort'],
    ] as const) {
      const accessibleName = control.getAttribute('aria-label') ?? ''
      expect(accessibleName).toContain(t('he', `people.profile.calendarSync.${short}`))
    }
  })

  it('carries the chosen range on the feed URL it hands out', async () => {
    const onCopy = vi.fn()
    open({ onCopy })
    await screen.findByTestId('calendar-sync-popup')

    const to = screen.getByLabelText(t('he', 'people.profile.calendarSync.to'))
    await userEvent.clear(to)
    await userEvent.type(to, '2026-12-31')

    await userEvent.click(
      screen.getByRole('button', { name: t('he', 'people.profile.calendarSync.copy') }),
    )

    const ranged = rangedFeedUrl(FEED.url, TODAY, '2026-12-31')
    expect(onCopy).toHaveBeenCalledWith(ranged)
    expect(
      screen.getByRole('link', { name: t('he', 'people.profile.calendarSync.google') }),
    ).toHaveAttribute('href', googleSubscribeUrl(ranged))
    expect(
      screen.getByRole('link', { name: t('he', 'people.profile.calendarSync.apple') }),
    ).toHaveAttribute('href', webcalUrl(ranged))
  })

  it('builds the iOS link as webcal://, which subscribes rather than downloads', async () => {
    // The scheme is the whole point, and it is the one thing about this panel that survived
    // the redesign unchanged: `https://` downloads a one-off snapshot that never updates
    // again — which looks like it worked and silently stops reflecting the timetable.
    open()
    await screen.findByTestId('calendar-sync-popup')
    const apple = screen.getByRole('link', {
      name: t('he', 'people.profile.calendarSync.apple'),
    })
    expect(apple.getAttribute('href')).toMatch(/^webcal:\/\//)
  })

  it('refuses a backwards range instead of handing out a link that means nothing', async () => {
    open()
    await screen.findByTestId('calendar-sync-popup')

    const to = screen.getByLabelText(t('he', 'people.profile.calendarSync.to'))
    await userEvent.clear(to)
    await userEvent.type(to, '2026-09-01')

    expect(await screen.findByTestId('calendar-sync-range-error')).toHaveTextContent(
      t('he', 'people.profile.calendarSync.rangeBackwards'),
    )
    // Refuse rather than accept: the three controls are gone while the range cannot be
    // meant, instead of quietly handing over a URL nobody can use.
    expect(
      screen.queryByRole('button', { name: t('he', 'people.profile.calendarSync.copy') }),
    ).toBeNull()
  })

  it('says the feed could not be read rather than showing dead controls', async () => {
    // P8 — the panel this replaces swallowed the failure and drew its create-a-feed state.
    open({ client: feedClient({ calendarFeeds: vi.fn().mockRejectedValue(new Error('nope')) }) })
    expect(await screen.findByTestId('calendar-sync-failed')).toBeInTheDocument()
    expect(
      screen.queryByRole('link', { name: t('he', 'people.profile.calendarSync.google') }),
    ).toBeNull()
  })

  it('closes', async () => {
    const onClose = vi.fn()
    open({ onClose })
    await screen.findByTestId('calendar-sync-popup')
    await userEvent.click(screen.getByRole('button', { name: t('he', 'people.profile.close') }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})

describe('rangedFeedUrl', () => {
  it('appends the window without disturbing a URL that already has a query', () => {
    expect(rangedFeedUrl('https://x.invalid/a.ics', '2026-01-01', '2026-02-01')).toBe(
      'https://x.invalid/a.ics?from=2026-01-01&to=2026-02-01',
    )
    expect(rangedFeedUrl('https://x.invalid/a.ics?v=2', '2026-01-01', '2026-02-01')).toBe(
      'https://x.invalid/a.ics?v=2&from=2026-01-01&to=2026-02-01',
    )
  })
})
