// Dashboard artboard 4e — מסמכים והצהרות · what is missing, from whom.
//
// **No medical content appears on this screen.** 4e's own opening line, and the rule the whole
// view is built to keep: only whether a document exists, who owes it, and how to ask. Not one
// `derived_flag`, not one answer. §5.5 puts the flags on a coach's roster and the record behind a
// manager-only, audit-logged read; a compliance table is neither.
//
// Findings acted on, and findings refused:
//   * **finding 1 — build the audit notice.** `documents.viewFullNotice` renders beside every
//     `צפייה`, because §11.2 logs the read and the manager should know before they open it, not
//     after. The artboard does not draw it; 4e says explicitly "do not read the silence as a
//     decision".
//   * **finding 8 — build the empty state.** It is the goal state and the artboard omits it.
//   * **finding 2 — refused.** No expiring-soon chip and no validity column: §5.5 says
//     declarations do not expire, and this would be the ninth artboard to say otherwise.
//   * **finding 3 — refused.** No manual upload of a completed declaration. It produces a record
//     with no `derived_flags`, so the coach's ⚠ silently does not appear — reintroducing exactly
//     the design D11 rejected.
//   * **finding 5 — refused.** No insurance-certificate row and no photo-waiver row. Insurance
//     has no model at all and a photo waiver is §11.6 consent, M9's.
//   * **finding 6 — decided.** The group request targets everyone on the current filter, and its
//     count is that list's length rather than a number computed elsewhere. The artboard leaves
//     the checkbox relationship undefined; a count that cannot disagree with the rows above it is
//     the version with no wrong answer.
//   * **finding 7 — recorded.** `ChipStatus` has no member for any document state, so the three
//     it does have are mapped by meaning: missing → danger-ish `debt`, trial → `pending`, signed
//     → `paid`. A feature does not invent a fourth chip primitive.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, StatusChip } from '@studio/ui'
import type { ChipStatus } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { DashboardHealthClient, DocumentFilter, HealthStatusSummaryOut } from './healthClient'

const toolbarStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-2)',
  marginBlockEnd: 'var(--space-3)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 'var(--space-3)',
  paddingBlock: 'var(--space-3)',
  borderBlockEnd: '1px solid var(--border)',
}

const FILTERS: readonly DocumentFilter[] = ['all', 'missing', 'trial_signed', 'signed']

/**
 * 4e finding 7: `ChipStatus` covers none of the document states, so the closest existing member
 * carries each meaning. Exported so a test asserts the mapping rather than a rendered colour.
 */
export function chipStatusFor(status: HealthStatusSummaryOut['health_status']): ChipStatus {
  if (status === 'missing') return 'debt'
  if (status === 'trial_signed') return 'pending'
  return 'paid'
}

export function filterLabel(locale: Locale, filter: DocumentFilter): string {
  if (filter === 'all') return t(locale, 'health.documents.all')
  if (filter === 'missing') return t(locale, 'health.documents.missing')
  if (filter === 'trial_signed') return t(locale, 'health.documents.trialOnly')
  return t(locale, 'health.documents.signed')
}

export function statusLabel(locale: Locale, status: HealthStatusSummaryOut['health_status']): string {
  if (status === 'missing') return t(locale, 'health.badge.missing')
  if (status === 'trial_signed') return t(locale, 'health.badge.trialSigned')
  return t(locale, 'health.badge.signed')
}

/**
 * 4e finding 6, decided: the group request targets **everyone currently listed who still owes
 * something**, and the button's count is that list's length.
 *
 * The artboard's own count excludes its awaiting-signature four and the relationship to the row
 * checkboxes is undefined — two different features drawn as one. A count derived from the rows on
 * screen cannot disagree with them.
 */
export function chaseable(rows: readonly HealthStatusSummaryOut[]): HealthStatusSummaryOut[] {
  return rows.filter((row) => row.health_status !== 'signed')
}

export type DocumentsScreenProps = {
  locale: Locale
  client: DashboardHealthClient
  onEditTemplate?: () => void
}

export function DocumentsScreen({ locale, client, onEditTemplate }: DocumentsScreenProps) {
  const [filter, setFilter] = useState<DocumentFilter>('all')
  const [rows, setRows] = useState<HealthStatusSummaryOut[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [reminded, setReminded] = useState<Record<string, boolean>>({})

  // The failure flag is cleared in the resolve branch rather than before the request. Clearing
  // it here synchronously is a setState in an effect body, which react-hooks/set-state-in-effect
  // rejects as a cascading render — and it is the same information either way: an error that is
  // still on screen while a retry is in flight is not a lie, it is the last thing that happened.
  const load = useCallback(() => {
    client
      .summary(filter)
      .then((next) => {
        setRows(next)
        setFailed(false)
      })
      .catch(() => setFailed(true))
  }, [client, filter])

  useEffect(load, [load])

  const outstanding = useMemo(() => chaseable(rows ?? []), [rows])

  const remind = (studentId: string) => {
    client
      .remind(studentId)
      .then(() => setReminded((previous) => ({ ...previous, [studentId]: true })))
      .catch(() => setFailed(true))
  }

  const remindAll = () => {
    for (const row of outstanding) remind(row.student_id)
  }

  return (
    <section aria-labelledby="documents-title">
      <header style={toolbarStyle}>
        <h1 id="documents-title">{t(locale, 'health.documents.title')}</h1>
        <span style={{ color: 'var(--text-muted)' }}>
          {t(locale, 'health.documents.summaryTotal')} {rows?.length ?? 0} ·{' '}
          {t(locale, 'health.documents.missing')} {outstanding.length}
        </span>
        <span style={{ flex: 1 }} />
        {onEditTemplate ? (
          <Button onClick={onEditTemplate} type="button" variant="secondary">
            {t(locale, 'health.template.edit')}
          </Button>
        ) : null}
        <Button disabled={outstanding.length === 0} onClick={remindAll} type="button" variant="primary">
          {t(locale, 'health.documents.requestGroupCount')} · {outstanding.length}
        </Button>
      </header>

      <div style={toolbarStyle}>
        {FILTERS.map((candidate) => (
          <Button
            key={candidate}
            onClick={() => setFilter(candidate)}
            type="button"
            variant={candidate === filter ? 'primary' : 'secondary'}
          >
            {filterLabel(locale, candidate)}
          </Button>
        ))}
      </div>

      {failed ? <p role="alert">{t(locale, 'health.documents.error')}</p> : null}
      {rows === null ? <p>{t(locale, 'health.documents.loading')}</p> : null}

      {rows !== null && rows.length === 0 ? (
        // 4e finding 8 — the goal state, which the artboard does not draw.
        <EmptyState
          title={
            filter === 'all'
              ? t(locale, 'health.documents.empty')
              : t(locale, 'health.documents.filteredEmpty')
          }
        />
      ) : null}

      {(rows ?? []).map((row) => (
        <Card key={row.student_id}>
          <div style={rowStyle}>
            <span style={{ flex: 1 }}>
              <bdi>{row.student_display_name}</bdi>
            </span>
            <StatusChip
              label={statusLabel(locale, row.health_status)}
              status={chipStatusFor(row.health_status)}
            />
            {row.health_status === 'signed' ? (
              <>
                {/* `noreferrer` as well as `noopener`: the URL of a health-declaration PDF
                    names a student, and sending it as a Referer to whatever the browser
                    opens next leaks that outside §11.2's audited read. */}
                <a
                  href={client.pdfUrl(row.student_id)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {t(locale, 'health.documents.viewFull')}
                </a>
                {/* 4e finding 1. §11.2 logs the read; the manager is told before it happens. */}
                <span
                  data-testid={`audit-notice-${row.student_id}`}
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: 'var(--text-caption)',
                  }}
                >
                  {t(locale, 'health.documents.viewFullNotice')}
                </span>
              </>
            ) : (
              <Button onClick={() => remind(row.student_id)} type="button" variant="secondary">
                {reminded[row.student_id]
                  ? t(locale, 'health.reminder.sent')
                  : t(locale, 'health.reminder.send')}
              </Button>
            )}
          </div>
        </Card>
      ))}
    </section>
  )
}
