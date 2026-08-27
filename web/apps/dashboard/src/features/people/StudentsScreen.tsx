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
import { apiFetch, appendPage } from '@studio/core'
import type { CursorPage } from '@studio/core'
import { ConfirmDialog } from '../rollover/ConfirmDialog'
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
  // F8 — the payment column, from `charge` at last. Manager-only read; a failed read
  // renders the em dash rather than a reassuring ✓.
  const [openByStudent, setOpenByStudent] = useState<Record<string, 'overdue' | 'open'> | null>(
    null,
  )

  useEffect(() => {
    let alive = true
    void (async () => {
      const map: Record<string, 'overdue' | 'open'> = {}
      let cursor: string | null = null
      try {
        do {
          const params = new URLSearchParams({ status: 'open', limit: '200' })
          if (cursor) params.set('cursor', cursor)
          const response = await apiFetch(`/api/v1/charges?${params.toString()}`)
          if (!response.ok) throw new Error(String(response.status))
          const body = (await response.json()) as {
            items: { student_id: string | null; due_date: string }[]
            next_cursor: string | null
          }
          const today = new Date().toISOString().slice(0, 10)
          for (const charge of body.items) {
            if (!charge.student_id) continue
            const overdue = charge.due_date < today
            if (overdue || map[charge.student_id] !== 'overdue') {
              map[charge.student_id] = overdue ? 'overdue' : 'open'
            }
          }
          cursor = body.next_cursor
        } while (cursor)
        if (alive) setOpenByStudent(map)
      } catch {
        if (alive) setOpenByStudent(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  // F12 — selection and the bulk bar. Outcomes render PER ROW, the rollover's refusal
  // shape: a half-succeeded batch must say which rows failed and why.
  const [selected, setSelected] = useState<string[]>([])
  const [bulkGroup, setBulkGroup] = useState('')
  const [bulkGroups, setBulkGroups] = useState<{ id: string; name: string }[]>([])
  const [confirmingBulk, setConfirmingBulk] = useState<'move' | 'leave' | null>(null)
  const [bulkOutcome, setBulkOutcome] = useState<{
    applied: number
    refused: { id: string; reason: string }[]
  } | null>(null)

  useEffect(() => {
    let alive = true
    void apiFetch('/api/v1/groups')
      .then(async (r) =>
        r.ok
          ? ((await r.json()) as { items: { id: string; name: string; is_active: boolean }[] })
              .items
          : [],
      )
      .then((rows) => alive && setBulkGroups(rows.filter((row) => row.is_active)))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  async function bulkMove() {
    setConfirmingBulk(null)
    const response = await apiFetch('/api/v1/students/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_moves: selected.map((studentId) => ({ student_id: studentId, group_id: bulkGroup })),
      }),
    })
    if (!response.ok) {
      setBulkOutcome({ applied: 0, refused: selected.map((id) => ({ id, reason: 'failed' })) })
      return
    }
    const body = (await response.json()) as {
      applied: number
      refused: { id: string; reason: string }[]
    }
    setBulkOutcome(body)
    setSelected([])
    reload()
  }

  async function bulkLeave() {
    setConfirmingBulk(null)
    // Reuses the existing per-student leave route rather than a second implementation;
    // the aggregation keeps the per-row answer.
    const refused: { id: string; reason: string }[] = []
    let applied = 0
    for (const studentId of selected) {
      const response = await apiFetch(`/api/v1/students/${studentId}/leave`, { method: 'POST' })
      if (response.ok) applied += 1
      else refused.push({ id: studentId, reason: 'failed' })
    }
    setBulkOutcome({ applied, refused })
    setSelected([])
    reload()
  }
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  // Which query the page in state answers. Derived rather than a `loading` flag set
  // synchronously in the effect body: that is a cascading render, and eslint's
  // `react-hooks/set-state-in-effect` is right to refuse it. Comparing the answered query
  // to the current one says the same thing without the extra render.
  const [answered, setAnswered] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const asked = `${query}\u0000${status}\u0000${version}`
  const loaded = answered === asked
  const reload = () => setVersion((n) => n + 1)

  useEffect(() => {
    let live = true
    const key = `${query}\u0000${status}\u0000${version}`
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
  }, [client, query, status, version])

  const nameOfStudent = (id: string) => {
    const row = page.items.find((student) => student.id === id)
    return row ? `${row.first_name} ${row.last_name}` : id
  }

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

      {/* 3c's entry point. The add-student screen shipped reachable only by TYPING
          #/students/new — a screen with no inbound link is a screen that does not exist
          to the person the audit calls "a human at 2am". */}
      <a
        className="studio-btn"
        data-variant="primary"
        href="#/students/new"
        data-testid="students-add"
        style={{ alignSelf: 'start' }}
      >
        {t(locale, 'people.student.add')}
      </a>

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
        <>
        {selected.length > 0 ? (
          <div data-testid="students-bulk-bar" style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'end', flexWrap: 'wrap' }}>
            <span>{t(locale, 'people.bulk.selected').replace('{n}', String(selected.length))}</span>
            <label>
              {t(locale, 'people.bulk.move')}
              <select
                data-testid="bulk-group"
                onChange={(event) => setBulkGroup(event.target.value)}
                value={bulkGroup}
              >
                <option value="">—</option>
                {bulkGroups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              data-testid="bulk-move"
              disabled={!bulkGroup}
              onClick={() => setConfirmingBulk('move')}
            >
              {t(locale, 'people.bulk.move')}
            </Button>
            <Button
              data-testid="bulk-leave"
              onClick={() => setConfirmingBulk('leave')}
              variant="destructive"
            >
              {t(locale, 'people.bulk.leave')}
            </Button>
          </div>
        ) : null}
        {confirmingBulk ? (
          <ConfirmDialog
            body={t(
              locale,
              confirmingBulk === 'move' ? 'people.bulk.moveConfirm' : 'people.bulk.leaveConfirm',
            )}
            confirmLabel={t(
              locale,
              confirmingBulk === 'move' ? 'people.bulk.move' : 'people.bulk.leave',
            )}
            locale={locale}
            onCancel={() => setConfirmingBulk(null)}
            onConfirm={() => void (confirmingBulk === 'move' ? bulkMove() : bulkLeave())}
            testId="confirm-bulk"
            title={t(
              locale,
              confirmingBulk === 'move' ? 'people.bulk.move' : 'people.bulk.leave',
            )}
            titleId="confirm-bulk-title"
          />
        ) : null}
        {bulkOutcome ? (
          <div data-testid="bulk-outcome">
            <p>{t(locale, 'people.bulk.applied').replace('{n}', String(bulkOutcome.applied))}</p>
            {bulkOutcome.refused.length > 0 ? (
              <ul>
                {bulkOutcome.refused.map((row) => (
                  <li data-testid={`bulk-refused-${row.id}`} key={row.id}>
                    {nameOfStudent(row.id)} ·{' '}
                    {t(locale, `people.bulk.refused.${row.reason}`)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <span data-testid="students-table">
          {/* F1b — explicit widths through the primitive, which is what un-collapses the
              header the audit measured as "one run-on string", plus F11's card fallback
              below 768px. */}
          <Table
            caption={t(locale, 'people.student.plural')}
            columns={[
              {
                id: 'select',
                header: t(locale, 'people.bulk.move'),
                width: '3rem',
                cell: (student) => (
                  <input
                    aria-label={`${student.first_name} ${student.last_name}`}
                    checked={selected.includes(student.id)}
                    data-testid={`select-${student.id}`}
                    onChange={() =>
                      setSelected((current) =>
                        current.includes(student.id)
                          ? current.filter((id) => id !== student.id)
                          : [...current, student.id],
                      )
                    }
                    type="checkbox"
                  />
                ),
              },
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
                header: t(locale, 'people.student.payment'),
                width: '8rem',
                cell: (student) => {
                  if (openByStudent === null) {
                    // A failed or still-loading read is an em dash, never a fake ✓.
                    return <span data-testid="students-payment-pending">—</span>
                  }
                  const state = openByStudent[student.id]
                  return (
                    <span data-testid={`students-payment-${student.id}`}>
                      <StatusChip
                        status={state === 'overdue' ? 'debt' : state === 'open' ? 'pending' : 'paid'}
                        label={t(
                          locale,
                          state === 'overdue'
                            ? 'people.student.payment.overdue'
                            : state === 'open'
                              ? 'people.student.payment.open'
                              : 'people.student.payment.settled',
                        )}
                      />
                    </span>
                  )
                },
              },
            ]}
            rowKey={(student) => student.id}
            rows={page.items}
          />
        </span>
        </>
      )}

      {page.has_more ? (
        <Button variant="secondary" onClick={loadMore} data-testid="students-load-more">
          {t(locale, 'people.table.loadMore')}
        </Button>
      ) : null}
    </section>
  )
}
