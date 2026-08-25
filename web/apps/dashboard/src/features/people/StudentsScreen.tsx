// Dashboard artboard 3b — חניכים: טבלה עם מסננים, מסמכים ומצב תשלום.
//
// A real <table> with a <caption> and <th scope="col">. A grid of divs looks identical and
// is unreadable to a screen reader, and §6.4 puts this in front of a manager who may be
// using one.
//
// **מצב תשלום is an explicitly empty column, not an invented one.** `charge` is W4's table.
// A plausible-looking payment column in a manager's decision-making screen would be a
// fabrication — so the column exists, is labelled, and says when it fills in.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, EmptyState, StatusChip } from '@studio/ui'
import { appendPage } from '@studio/core'
import type { CursorPage } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardPeopleClient, StudentSummary } from './peopleClient'

const scrollerStyle: CSSProperties = {
  // The table scrolls inside its own container; the page never scrolls sideways.
  overflowX: 'auto',
  inlineSize: '100%',
}

const filterRowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-3)',
  alignItems: 'end',
}

const STATUSES = [
  'lead',
  'trial',
  'pending_approval',
  'active',
  'frozen',
  'left',
  'lost',
] as const

type StudentPage = CursorPage<StudentSummary>

export function chipToneFor(status: string): 'paid' | 'pending' | 'cancelled' | 'planned' {
  if (status === 'active') return 'paid'
  if (status === 'left' || status === 'lost') return 'cancelled'
  if (status === 'frozen') return 'planned'
  return 'pending'
}

/**
 * The מסמכים column. Rendered from `people.ts` keys and not `health.ts`: that namespace is
 * M4's, and a lane borrowing another's serializes both waves (plan §1.3, seam 3).
 */
export function documentLabelKey(healthStatus: string): string {
  if (healthStatus === 'signed') return 'people.document.signed'
  if (healthStatus === 'trial_signed') return 'people.document.trialSigned'
  return 'people.document.missing'
}

export function StudentsScreen({
  locale,
  client,
  onOpen,
}: {
  locale: Locale
  client: DashboardPeopleClient
  onOpen?: (studentId: string) => void
}) {
  // The whole page, not a bare list: `appendPage` de-duplicates by id and keeps the
  // fresher copy, which is what stops a student renamed between two requests rendering
  // twice under two names.
  const [page, setPage] = useState<StudentPage>({ items: [], next_cursor: null, has_more: false })
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  // Which query the page in state answers. Derived rather than a `loading` flag set
  // synchronously in the effect body: that is a cascading render, and eslint's
  // `react-hooks/set-state-in-effect` is right to refuse it. Comparing the answered query
  // to the current one says the same thing without the extra render.
  const [answered, setAnswered] = useState<string | null>(null)
  const asked = `${query}\u0000${status}`
  const loaded = answered === asked

  useEffect(() => {
    let live = true
    const key = `${query}\u0000${status}`
    client
      .students({ q: query, status })
      .then((fresh) => {
        if (!live) return
        setPage(fresh)
        setAnswered(key)
      })
      .catch(() => live && setAnswered(key))
    return () => {
      live = false
    }
  }, [client, query, status])

  const loadMore = () => {
    if (!page.next_cursor) return
    client
      .students({ q: query, status, after: page.next_cursor })
      // `appendPage` from @studio/core — never a hand-rolled merge, which is where a
      // cursor list starts duplicating rows.
      .then((next) => setPage((current) => appendPage(current, next)))
  }

  return (
    <section aria-labelledby="students-title" data-testid="students-screen">
      <h1 id="students-title">{t(locale, 'people.student.plural')}</h1>

      <div style={filterRowStyle}>
        <label>
          {t(locale, 'people.student.search')}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(locale, 'people.search.placeholder')}
            data-testid="students-search"
          />
        </label>
        <label>
          {t(locale, 'people.status.label')}
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            data-testid="students-status-filter"
          >
            <option value="">—</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {t(locale, `people.status.${value}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loaded && page.items.length === 0 ? (
        <EmptyState
          title={t(
            locale,
            query || status ? 'people.student.emptyFiltered' : 'people.student.empty',
          )}
        />
      ) : (
        <div style={scrollerStyle}>
          <table data-testid="students-table">
            <caption>{t(locale, 'people.student.plural')}</caption>
            <thead>
              <tr>
                <th scope="col">{t(locale, 'people.student.one')}</th>
                <th scope="col">{t(locale, 'people.student.groups')}</th>
                <th scope="col">{t(locale, 'people.status.label')}</th>
                <th scope="col">{t(locale, 'people.document.signed')}</th>
                <th scope="col">{t(locale, 'people.document.paymentComesLater')}</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((student) => (
                <tr key={student.id} data-testid="students-row">
                  <td>
                    <button type="button" onClick={() => onOpen?.(student.id)}>
                      <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
                    </button>
                  </td>
                  <td>
                    <bdi>
                      {student.group_names && student.group_names.length > 0
                        ? student.group_names.join(' · ')
                        : t(locale, 'people.student.noGroup')}
                    </bdi>
                  </td>
                  <td>
                    <StatusChip
                      status={chipToneFor(student.status)}
                      label={t(locale, `people.status.${student.status}`)}
                    />
                  </td>
                  <td data-testid="students-document">
                    {t(locale, documentLabelKey(student.health_status))}
                  </td>
                  {/* W4 owns `charge`. An invented number here would be a fabrication in
                      the screen a manager makes decisions from. */}
                  <td data-testid="students-payment-pending">—</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {page.has_more ? (
        <Button variant="secondary" onClick={loadMore} data-testid="students-load-more">
          {t(locale, 'people.table.loadMore')}
        </Button>
      ) : null}
    </section>
  )
}
