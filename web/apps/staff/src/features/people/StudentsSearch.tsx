// Staff artboard 9h — חניכים, the search tab.
//
// §6.2: built mobile-first for one-handed use on a mat — large tap targets, high contrast,
// works in bright light, no interaction requiring precision.
//
// **No money, anywhere.** §3.2's hard rule: "coaches never see money. No charge, payment,
// debt or price is reachable from any coach-scoped endpoint or screen." The endpoint behind
// this returns `StudentSummaryOut`, which has no financial field — invariant 3 is what keeps
// it that way, and this screen adds nothing.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { EmptyState, StudentRow, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { StaffPeopleClient, StudentSummary } from './peopleClient'

const searchStyle: CSSProperties = {
  // §6.2's 44px rule — a thumb, one-handed, on a mat.
  minBlockSize: '44px',
}

const listStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

/**
 * §5.4a's statuses on `StatusChip`'s six tones.
 *
 * `ChipStatus` has no `trial` member and `@studio/ui` is not this lane's to change, so the
 * tone is the nearest honest one and the **label** carries the meaning — which is SC 1.4.1's
 * rule anyway: never colour alone.
 */
export function chipToneFor(status: string): 'paid' | 'pending' | 'cancelled' | 'planned' {
  if (status === 'active') return 'paid'
  if (status === 'left' || status === 'lost') return 'cancelled'
  if (status === 'frozen') return 'planned'
  return 'pending'
}

export function StudentsSearch({
  locale,
  client,
  onOpen,
}: {
  locale: Locale
  client: StaffPeopleClient
  onOpen?: (studentId: string) => void
}) {
  const [query, setQuery] = useState('')
  const [students, setStudents] = useState<StudentSummary[] | null>(null)

  useEffect(() => {
    let live = true
    client
      .search(query)
      .then((body) => live && setStudents(body.items))
      .catch(() => live && setStudents([]))
    return () => {
      live = false
    }
  }, [client, query])

  return (
    <section aria-labelledby="students-search-title" data-testid="students-search">
      <h1 id="students-search-title">{t(locale, 'people.student.plural')}</h1>
      <TextField
        label={t(locale, 'people.student.search')}
        placeholder={t(locale, 'people.search.placeholder')}
        value={query}
        style={searchStyle}
        onChange={(event) => setQuery(event.target.value)}
      />

      {students === null ? null : students.length === 0 ? (
        // Two different situations, two different sentences: nothing matched what you
        // typed, versus the club has no students at all.
        <EmptyState
          title={t(locale, query ? 'people.student.emptyFiltered' : 'people.student.empty')}
        />
      ) : (
        <ul style={listStyle}>
          {students.map((student) => (
            <li key={student.id}>
              <StudentRow
                name={`${student.first_name} ${student.last_name}`}
                groupLabel={
                  student.group_names && student.group_names.length > 0
                    ? student.group_names.join(' · ')
                    : t(locale, 'people.student.noGroup')
                }
                belt={{
                  colorHex: student.current_belt_color_hex ?? 'transparent',
                  label: student.current_belt_name ?? '',
                }}
                // §5.4a — 'the ניסיון chip appears on the roster row, on the student card,
                // in the session header count and in the manager's daily summary.
                // student.status is surfaced everywhere a student is rendered, never
                // inferred from the absence of an enrollment.'
                status={{
                  status: chipToneFor(student.status),
                  label: t(locale, `people.status.${student.status}`),
                }}
                onSelect={onOpen ? () => onOpen(student.id) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
