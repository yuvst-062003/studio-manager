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
import { Button, EmptyState, StatusChip, Table } from '@studio/ui'
import { appendPage } from '@studio/core'
import type { CursorPage } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardPeopleClient, StudentSummary } from './peopleClient'

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
        <span data-testid="students-table">
          {/* F1b — explicit widths through the primitive, which is what un-collapses the
              header the audit measured as "one run-on string", plus F11's card fallback
              below 768px. */}
          <Table
            caption={t(locale, 'people.student.plural')}
            columns={[
              {
                id: 'student',
                header: t(locale, 'people.student.one'),
                width: '12rem',
                cell: (student) => (
                  <button type="button" onClick={() => onOpen?.(student.id)}>
                    <bdi>{`${student.first_name} ${student.last_name}`}</bdi>
                  </button>
                ),
              },
              {
                id: 'groups',
                header: t(locale, 'people.student.groups'),
                width: '14rem',
                cell: (student) => (
                  <bdi>
                    {student.group_names && student.group_names.length > 0
                      ? student.group_names.join(' · ')
                      : t(locale, 'people.student.noGroup')}
                  </bdi>
                ),
              },
              {
                id: 'status',
                header: t(locale, 'people.status.label'),
                width: '10rem',
                cell: (student) => (
                  <>
                    <StatusChip
                      status={chipToneFor(student.status)}
                      label={t(locale, `people.status.${student.status}`)}
                    />
                    {student.source === 'onboarding_link' ? (
                      // §5.4b's checklist chip — the ניסיון pattern on the migration
                      // cohort: it marks who arrived through the link until the manager
                      // has looked at them (price confirmed, duplicates merged).
                      <span data-testid="onboarding-chip">
                        <StatusChip status="pending" label={t(locale, 'people.join.chip')} />
                      </span>
                    ) : null}
                  </>
                ),
              },
              {
                id: 'document',
                header: t(locale, 'people.document.signed'),
                width: '9rem',
                cell: (student) => (
                  <span data-testid="students-document">
                    {t(locale, documentLabelKey(student.health_status))}
                  </span>
                ),
              },
              {
                id: 'payment',
                header: t(locale, 'people.document.paymentComesLater'),
                width: '8rem',
                // W4 owns `charge`. An invented number here would be a fabrication in
                // the screen a manager makes decisions from.
                cell: () => <span data-testid="students-payment-pending">—</span>,
              },
            ]}
            rowKey={(student) => student.id}
            rows={page.items}
          />
        </span>
      )}

      {page.has_more ? (
        <Button variant="secondary" onClick={loadMore} data-testid="students-load-more">
          {t(locale, 'people.table.loadMore')}
        </Button>
      ) : null}
    </section>
  )
}
