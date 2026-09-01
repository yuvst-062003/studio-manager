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
// **One row, not a section.** The card is a record of who the child is NOW — the current
// status lives in the header chip — so the moves that got them here are one labelled row
// like every other fact, not a heading with an ordered list under it.
//
// The moves render INSIDE the row rather than behind a link, because there is no screen to
// link to: `#/student/<id>` is the whole of 2c and no route serves a history of its own. A
// chevron pointing at a page that does not exist is worse than a row that is two lines
// tall, and a family's history is two or three moves in the ordinary case.
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiFetch, formatDateInStudioZone } from '@studio/core'
import { DetailRow } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { makePeopleClient } from '../peopleClient'
import type { MyStatusHistoryRow } from '../peopleClient'

const moveStyle: CSSProperties = {
  alignItems: 'baseline',
  display: 'flex',
  gap: 'var(--space-3)',
}

//: The date qualifies the status and reads as secondary to it — the same treatment the
//: enrollment row gives its weekday list, and it lands on the same edge.
const whenStyle: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 'var(--text-caption)',
  marginInlineStart: 'auto',
  textAlign: 'end',
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
      // A failed read renders NOTHING, not an error card. This is one row of a composite
      // screen; a 403 or a network blip here must not turn the whole student card into a
      // failure, and the family's belt, groups and attendance are unaffected.
      .catch(() => live && setRows([]))
    return () => {
      live = false
    }
  }, [client, student.id])

  // Nothing while loading, and nothing when there is no history. A child created by a
  // manager has no move to show until the first one happens — `StudentService.create` sets
  // `status='lead'` on the row and writes no history row for it, because the student
  // existing is not a move. An empty row under "חברות" would read as a broken feature
  // rather than one with nothing to say.
  if (rows === null || rows.length === 0) return null

  // Oldest first — the order the server returns and the order a timeline reads in. The
  // server's first row is the first MOVE, not the child's creation, so nothing here labels
  // row one as "joined".
  return (
    <DetailRow label={t(locale, 'people.card.membership')} testId="parent-status-history">
      {rows.map((row) => (
        <span
          key={`${row.changed_at}-${row.to_status}`}
          data-testid="parent-status-row"
          style={moveStyle}
        >
          <span>{t(locale, `people.status.${row.to_status}`)}</span>
          {/* G3 — stored UTC, rendered Asia/Jerusalem regardless of locale. */}
          <span style={whenStyle}>{formatDateInStudioZone(row.changed_at, locale)}</span>
        </span>
      ))}
    </DetailRow>
  )
}
