// #29 — הגדרות → סנכרון יומן, rebuilt as a popup (owner, 2026-09-08).
//
// > "Settings → סינכרון יומן opens the old calendar design. Replace it with a popup asking
// > for a date range, then three icon buttons — copy link, add to Google Calendar, add to
// > iOS Calendar. Then delete the old design."
//
// **What it replaces, and why that was wrong.** The row was `<a href="#/calendar">`, and
// `#/calendar` is לוח הילד — a whole calendar SCREEN, with §5.12's subscribe panel
// (`features/comms/CalendarSync.tsx`) stacked underneath it. So a parent who tapped a row
// labelled "calendar sync" got a calendar to read, and had to scroll past it to reach the
// two links and the copy button they had actually asked for. `CalendarSync.tsx` is deleted
// in this change rather than merely unrouted; לוח הילד keeps its own row in הגדרות, which
// is what it was always the answer to.
//
// **NO NEW BACKEND ROUTE.** This reuses `GET /api/v1/calendar-feeds` and the feed URL it
// returns, exactly as the panel it replaces did.
//
// **The range is real.** It rides on the URL as `?from=&to=`, and
// `GET /api/v1/calendar/{token}.ics` honours both — see `CalendarFeedService.events_for`,
// where they narrow the default `LOOK_BACK`/`LOOK_AHEAD` window. A question whose answer is
// discarded is worse than one never asked, which is what this screen would have been while
// the route still ignored them.
//
// Both ends are independent and both are optional on the wire, so every link already in a
// parent's calendar — none of which carries a parameter — keeps behaving exactly as it did.
// A backwards range never reaches the server: the form below refuses it, and the route
// refuses it again with a 422 rather than rendering a valid, empty calendar that looks
// exactly like a club with nothing scheduled.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Copy, Smartphone } from 'lucide-react'
import { studioDayKey } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Sheet } from './Sheet'
import { SheetFailed } from './SheetFailed'
import { googleSubscribeUrl, webcalUrl } from '../../comms/commsClient'
import type { CalendarFeedOut, ParentCommsClient } from '../../comms/commsClient'

/** The default window the popup opens on: today, and the quarter after it. */
const DEFAULT_SPAN_DAYS = 90

/** `YYYY-MM-DD` arithmetic at MIDDAY UTC — midnight slips a day in a negative-offset zone,
 *  which `features/home/redesign/derive.ts` records having been bitten by. */
function shift(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number)
  const at = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 12))
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/**
 * The feed URL with the parent's window on it.
 *
 * `?from=&to=` appended by hand rather than through `new URL()`: the feed URL carries a
 * token, and round-tripping it through a parser to re-serialise it is a chance to
 * re-encode a character the server then fails to resolve. Appending is the operation, so
 * appending is what the code does.
 */
export function rangedFeedUrl(url: string, from: string, to: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}from=${from}&to=${to}`
}

/**
 * One of the three. **No longer icon-only (owner, 2026-09-08.)**
 *
 * A generic calendar glyph stood for Google and a phone glyph for iOS, which told a reader
 * nothing about which was which — "the icons are not clear of what is ios calendar and what
 * is google calendar". The `aria-label`s were right the whole time and invisible, so the
 * control was legible to a screen reader and a guess to everyone else.
 *
 * Each now carries a short VISIBLE name under its icon. The `aria-label` stays the fuller
 * sentence and still CONTAINS the visible text, which is what WCAG 2.5.3 (label in name)
 * asks: a voice-control user saying "Google" must hit the control that reads Google.
 */
const CONTROL_CLASS =
  'flex-1 min-w-0 px-2 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 ' +
  'text-[#0056c5] dark:text-blue-300 flex flex-col items-center justify-center gap-1 shadow-xs ' +
  'hover:bg-blue-50 dark:hover:bg-blue-400/15 active:scale-95 transition-all cursor-pointer ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0056c5]'

/** The visible name under the glyph. Truncates rather than wrapping a row of three. */
const CONTROL_LABEL_CLASS =
  'text-[11px] font-semibold leading-none max-w-full truncate text-slate-700 dark:text-slate-200'

export function CalendarSyncPopup({
  locale,
  client,
  todayKey,
  onClose,
  onCopy,
}: {
  locale: Locale
  client: ParentCommsClient
  /** The Jerusalem calendar day. A prop, not `new Date()`, all the way down — the default
   *  exists only so the settings sheet needs no clock of its own. */
  todayKey?: string
  onClose: () => void
  /** Injected so a test can assert the copy without a clipboard permission. */
  onCopy?: (text: string) => void
}) {
  const today = todayKey ?? studioDayKey(new Date())
  const [feed, setFeed] = useState<CalendarFeedOut | null>(null)
  const [readFailed, setReadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(() => shift(today, DEFAULT_SPAN_DAYS))
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let live = true
    client
      .calendarFeeds()
      .then((page) => {
        if (!live) return
        setReadFailed(false)
        setFeed(page.feeds.find((row) => row.subject_type === 'guardian') ?? null)
      })
      // P8 — a swallowed failure here used to render the CREATE-a-feed state, inviting a
      // parent to act on a feed the app had not managed to read. Failure says so instead.
      .catch(() => live && setReadFailed(true))
    return () => {
      live = false
    }
  }, [client, attempt])

  // Checked while the parent is still looking at the field, not after a round trip: a
  // backwards range is a typo, and a link built from one names a window that cannot exist.
  const backwards = Date.parse(`${to}T12:00:00Z`) < Date.parse(`${from}T12:00:00Z`)
  const url = useMemo(
    () => (feed && !backwards ? rangedFeedUrl(feed.url, from, to) : null),
    [feed, from, to, backwards],
  )

  const copy = useCallback(() => {
    if (url === null) return
    if (onCopy) onCopy(url)
    else void globalThis.navigator?.clipboard?.writeText(url)
    setCopied(true)
  }, [url, onCopy])

  return (
    <Sheet
      title={t(locale, 'people.profile.calendarFeed')}
      subtitle={t(locale, 'people.profile.calendarSync.subtitle')}
      locale={locale}
      testId="calendar-sync-popup"
      onClose={onClose}
    >
      {readFailed ? (
        <div data-testid="calendar-sync-failed">
          <SheetFailed
            locale={locale}
            onRetry={() => {
              setReadFailed(false)
              setAttempt((n) => n + 1)
            }}
          />
        </div>
      ) : (
        <>
          <fieldset className="space-y-1.5 text-start border-0 m-0 p-0">
            <legend className="text-xs font-bold text-slate-800 dark:text-slate-200 p-0">
              {t(locale, 'people.profile.calendarSync.rangeLegend')}
            </legend>
            <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/70 p-3 rounded-2xl border border-slate-100 dark:border-slate-700">
              <div>
                <label
                  htmlFor="calendar-sync-from"
                  className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold block mb-1"
                >
                  {t(locale, 'people.profile.calendarSync.from')}
                </label>
                <input
                  id="calendar-sync-from"
                  type="date"
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value)
                    setCopied(false)
                  }}
                  aria-invalid={backwards}
                  aria-describedby={backwards ? 'calendar-sync-error' : undefined}
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-600 p-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:border-[#0056c5] focus:ring-1 focus:ring-[#0056c5] outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="calendar-sync-to"
                  className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold block mb-1"
                >
                  {t(locale, 'people.profile.calendarSync.to')}
                </label>
                <input
                  id="calendar-sync-to"
                  type="date"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value)
                    setCopied(false)
                  }}
                  aria-invalid={backwards}
                  aria-describedby={backwards ? 'calendar-sync-error' : undefined}
                  className="w-full text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-600 p-2 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:border-[#0056c5] focus:ring-1 focus:ring-[#0056c5] outline-none"
                />
              </div>
            </div>
          </fieldset>

          {backwards ? (
            <p
              id="calendar-sync-error"
              role="alert"
              data-testid="calendar-sync-range-error"
              className="text-xs font-semibold text-[#ba1a1a] dark:text-red-300 bg-[#ffdad6] dark:bg-red-500/15 rounded-2xl p-3 text-start"
            >
              {t(locale, 'people.profile.calendarSync.rangeBackwards')}
            </p>
          ) : null}

          {/* THE THREE. Rendered only once there is a feed AND a range that can be meant —
              a control that is on screen and cannot work is the F2 defect
              `tools/__tests__/inert-buttons.test.ts` exists for, and a disabled-looking
              icon row would say nothing about which of the two is missing. */}
          {url !== null ? (
            <div className="flex items-stretch justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={copy}
                aria-label={t(locale, 'people.profile.calendarSync.copy')}
                data-testid="calendar-sync-copy"
                className={CONTROL_CLASS}
              >
                <Copy className="w-5 h-5" aria-hidden="true" />
                <span className={CONTROL_LABEL_CLASS} aria-hidden="true">
                  {t(locale, 'people.profile.calendarSync.copyShort')}
                </span>
              </button>
              {/* Google's subscribe dialog takes the https:// form. */}
              <a
                href={googleSubscribeUrl(url)}
                target="_blank"
                rel="noreferrer"
                aria-label={t(locale, 'people.profile.calendarSync.google')}
                data-testid="calendar-sync-google"
                className={CONTROL_CLASS}
              >
                <Calendar className="w-5 h-5" aria-hidden="true" />
                <span className={CONTROL_LABEL_CLASS} aria-hidden="true">
                  {t(locale, 'people.profile.calendarSync.googleShort')}
                </span>
              </a>
              {/* Apple's is `webcal://`, and the scheme is the whole point: the https://
                  form downloads a one-off snapshot that never updates again, which looks
                  like it worked. §12 — there is no third-party calendar WRITE API on Apple
                  at all, so subscription is not one option among several.

                  The glyph is a phone rather than an apple because the mark is a trademark
                  we do not ship; the WORD under it is what tells the two apart now. */}
              <a
                href={webcalUrl(url)}
                aria-label={t(locale, 'people.profile.calendarSync.apple')}
                data-testid="calendar-sync-apple"
                className={CONTROL_CLASS}
              >
                <Smartphone className="w-5 h-5" aria-hidden="true" />
                <span className={CONTROL_LABEL_CLASS} aria-hidden="true">
                  {t(locale, 'people.profile.calendarSync.appleShort')}
                </span>
              </a>
            </div>
          ) : null}

          {copied ? (
            <p
              role="status"
              data-testid="calendar-sync-copied"
              className="text-[11px] text-center text-slate-500 dark:text-slate-400"
            >
              {t(locale, 'people.profile.calendarSync.copied')}
            </p>
          ) : null}
        </>
      )}
    </Sheet>
  )
}
