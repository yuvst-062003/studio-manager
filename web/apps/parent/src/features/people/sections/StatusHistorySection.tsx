// `2c`'s membership history — the fourth history, and the only one the parent app had no
// way to show.
//
// Status (lead → trial → active → frozen → left) has been stored in `student_status_history`
// since M3 and rendered on dashboard `4a` since the same wave. "Joined 2 August, frozen 1
// October, returned 1 November" is exactly the record a parent telephones the club about,
// and until now the only way to answer that call was to read it off the manager's screen.
//
// **Two things this section must not do**, both asserted in the sibling spec:
//
//  * It reads `GET /me/students/{id}/status-history`, never the staff route beside it. That
//    one is `AnyStaff`-scoped — a guardian gets 403 — and it carries the manager's `reason`,
//    which is the club's own note about a family. Ship-audit B4 was this mistake made once
//    already, against `GET /students/{id}` in `ProfileAndLeave`, and nothing noticed for as
//    long as no route mounted the screen.
//  * It renders no money. §5.5 gives a guardian their own children's record and nothing
//    beside it; invariant 3's shape guarantee is the server half, and this is the other.
//
// It fetches for itself, like the belt and attendance sections do (`registerSlot`'s payload
// carries the student and nothing else), rather than asking the container to fetch on its
// behalf — which is what keeps `StudentCard` from having to know this section exists.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch, formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makePeopleClient } from '../peopleClient'
import type { MyStatusHistoryRow } from '../peopleClient'

const rowStyle: CSSProperties = {
  alignItems: 'baseline',
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
}

//: The date qualifies the status, and reads as secondary to it — the same treatment the
//: enrollment section gives its weekday list.
const whenStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
}

export function StatusHistorySection({
  student,
  locale,
}: {
  student: { id: string }
  locale: Locale
}) {
  const client = useMemo(() => makePeopleClient(apiFetch), [])
  const [rows, setRows] = useState<MyStatusHistoryRow[] | null>(null)

  useEffect(() => {
    let live = true
    client
      .myStatusHistory(student.id)
      .then((body) => live && setRows(body.items))
      // A failed read renders NOTHING, not an error card. This is one section of a
      // composite screen; a 403 or a network blip here must not turn the whole student
      // card into a failure, and the family's belt, groups and attendance are unaffected.
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [client, student.id])

  // Nothing while loading, and nothing when there is no history. A child created by a
  // manager has no move to show until the first one happens — `StudentService.create` sets
  // `status='lead'` on the row and writes no history row for it, because the student
  // existing is not a move. An empty card under "היסטוריית החברות" would read as a broken
  // feature rather than one with nothing to say.
  if (rows === null || rows.length === 0) return null

  return (
    <section aria-labelledby={`status-${student.id}`} data-testid="parent-status-history">
      <h2 id={`status-${student.id}`}>{t(locale, 'people.status.membershipHistory')}</h2>
      {/* An ordered list, oldest first — the order the server returns and the order a
          timeline reads in. The server's first row is the first MOVE, not the child's
          creation, so nothing here labels row one as "joined". */}
      <ol>
        {rows.map((row) => (
          <li
            key={`${row.changed_at}-${row.to_status}`}
            data-testid="parent-status-row"
            style={rowStyle}
          >
            <span>{t(locale, `people.status.${row.to_status}`)}</span>
            {/* G3 — stored UTC, rendered Asia/Jerusalem regardless of locale. */}
            <span style={whenStyle}>{formatDateInStudioZone(row.changed_at, locale)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
