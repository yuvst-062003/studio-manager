// The parent app's view of `/absence-reports`.
//
// **This client has no queue and must never grow one.** §10.2: "A parent's absence
// pre-report **requires a connection on purpose**: it is time-critical and worthless if it
// lands after the lesson. The app says so rather than queuing it into the void."
//
// That is the whole reason this is a separate client from anything in `@studio/core`'s
// offline layer: a report is the one parent write in the product, and the layer that would
// make it survive a tunnel is exactly the layer that would make it useless.
import type { Locale } from '@studio/i18n'

export type Fetcher = (path: string, init?: RequestInit) => Promise<Response>

/** Mirrors `app/schemas/attendance.py::AbsenceReportOut`. */
export interface AbsenceReportOut {
  id: string
  student_id: string
  session_id: string
  reported_by_person_id: string
  reason: string | null
  created_at: string
}

/** The upcoming lessons artboard `12a`'s picker offers. Read from the same
 *  `GET /sync/bootstrap` payload the staff app primes from — §10.2 gives the parent app a
 *  read-only cache of "upcoming sessions", so the picker works in a lift even though the
 *  submit does not. */
export interface UpcomingSession {
  id: string
  group_name: string
  starts_at: string
  location_name: string | null
}

/**
 * The server's refusals, as codes.
 *
 * §10.2's deadline is enforced on the server (a device an hour behind would otherwise file a
 * pre-report for a lesson in progress), so the screen learns which message to show from a
 * code rather than from a sentence — `attendance.absence.tooLate` and `.alreadyReported`
 * both already exist, and a server-authored Hebrew string would be one §9 cannot reach.
 */
export type AbsenceError = 'too_late' | 'already_reported' | 'not_found' | 'offline' | 'unknown'

export class AbsenceRefused extends Error {
  constructor(readonly code: AbsenceError) {
    super(code)
  }
}

export interface AbsenceClient {
  upcoming(): Promise<UpcomingSession[]>
  report(input: {
    studentId: string
    sessionId: string
    reason: string | null
  }): Promise<AbsenceReportOut>
  cancel(sessionId: string, studentId: string): Promise<void>
}

const API = '/api/v1'

export function makeAbsenceClient(fetcher: Fetcher): AbsenceClient {
  return {
    async upcoming() {
      const response = await fetcher(`${API}/sync/bootstrap`)
      if (!response.ok) throw new AbsenceRefused('unknown')
      const body = (await response.json()) as {
        sessions: {
          id: string
          group_name: string
          starts_at: string
          location_name: string | null
          status: string
        }[]
      }
      // A cancelled lesson is the club telling everyone not to come. Offering it in a
      // picker asks a parent to report an absence from a lesson that is not happening.
      return body.sessions.filter((session) => session.status === 'scheduled')
    },

    async report({ studentId, sessionId, reason }) {
      let response: Response
      try {
        response = await fetcher(`${API}/absence-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: studentId,
            session_id: sessionId,
            reason: reason === '' ? null : reason,
          }),
        })
      } catch {
        // §10.2 — the network failed, and this flow does not queue. The screen says so.
        throw new AbsenceRefused('offline')
      }
      if (response.status === 409) {
        const body = (await response.json()) as { detail?: { code?: string } }
        const code = body.detail?.code
        throw new AbsenceRefused(code === 'too_late' ? 'too_late' : 'already_reported')
      }
      if (response.status === 404) throw new AbsenceRefused('not_found')
      if (!response.ok) throw new AbsenceRefused('unknown')
      return (await response.json()) as AbsenceReportOut
    },

    async cancel(sessionId, studentId) {
      const response = await fetcher(`${API}/absence-reports/${sessionId}/${studentId}`, {
        method: 'DELETE',
      })
      if (!response.ok) throw new AbsenceRefused(response.status === 409 ? 'already_reported' : 'unknown')
    },
  }
}

/** `12a`'s countdown — `בעוד 9 שעות`. `12a` finding 5: "the countdown needs a relative-time
 *  formatter in `core`, with plurals. Third artboard needing one." Until `core` grows it,
 *  `Intl.RelativeTimeFormat` is what the platform already has, it pluralises correctly in
 *  all three locales, and it is a formatter rather than a string — so no Hebrew is inlined
 *  in a component (G4). */
export function countdown(fromIso: string, toIso: string, locale: Locale): string {
  const minutes = Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 60_000)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  return formatter.format(Math.round(hours / 24), 'day')
}
