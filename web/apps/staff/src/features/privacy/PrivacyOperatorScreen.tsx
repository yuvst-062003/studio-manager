// §16's operator view of §11.3 and §11.4: who asked for what, and what became of it.
//
// **Failures first, and counted.** `app/workers/privacy.py` refuses on purpose
// (HB-privacy-worker-unbuilt): `assemble_export_bundle` collects nothing and
// `purge_subject_data` deletes nothing, so every request in this queue ends `failed` with
// the worker's own reason on the row. That reason is rendered verbatim — English,
// technical — because the person reading this screen is the one who has to answer a
// guardian, and a translated paraphrase of a stack trace helps nobody.
//
// A pending request is a queue that has not drained. A FAILED subject-access request is a
// right somebody exercised and did not get, so it sorts to the top regardless of age.
//
// No subject NAMES on this screen. §11.1's minimisation: the row identifies a person by
// id, and matching an id to a family is a lookup the operator makes deliberately rather
// than a list of everyone who asked to be forgotten, rendered by default.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Card, EmptyState, PageHeader, StatusChip } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { PrivacyRequest, PrivacyRequests, StaffPrivacyClient } from './staffPrivacyClient'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  alignItems: 'center',
}

/** SPEC G3: stored UTC, rendered Asia/Jerusalem. */
function formatDate(iso: string, locale: Locale): string {
  try {
    return new Intl.DateTimeFormat(locale === 'he' ? 'he-IL' : locale, {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function chipStatus(status: string): 'pending' | 'paid' | 'debt' | 'cancelled' {
  if (status === 'completed') return 'paid'
  if (status === 'failed') return 'debt'
  if (status === 'expired') return 'cancelled'
  return 'pending'
}

function Row({ locale, row }: { locale: Locale; row: PrivacyRequest }) {
  const isExport = row.kind === 'export'
  return (
    <li data-testid={`privacy-request-${row.id}`} style={{ ...columnStyle, gap: 'var(--space-1)' }}>
      <div style={rowStyle}>
        <strong>
          {t(
            locale,
            isExport
              ? 'reports.privacy.requests.kind.export'
              : 'reports.privacy.requests.kind.deletion',
          )}
        </strong>
        <StatusChip
          label={t(
            locale,
            isExport
              ? `reports.privacy.export.status.${row.status}`
              : `reports.privacy.delete.status.${row.status}`,
          )}
          status={chipStatus(row.status)}
        />
      </div>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        {t(locale, 'reports.privacy.requests.subject')}:{' '}
        {/* A UUID inside RTL copy is the bare-digit case the a11y rule names. */}
        <bdi dir="ltr">{row.subject_person_id}</bdi>
      </p>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        {t(locale, 'reports.privacy.requests.requestedAt')}{' '}
        <bdi>{formatDate(row.created_at, locale)}</bdi>
      </p>
      {row.status === 'failed' ? (
        <>
          <p style={{ margin: 0 }}>
            {t(
              locale,
              isExport
                ? 'reports.privacy.export.failedHelp'
                : 'reports.privacy.delete.failedHelp',
            )}
          </p>
          {row.error ? (
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              {t(locale, 'reports.privacy.export.failedReason')}:{' '}
              <bdi dir="ltr">{row.error}</bdi>
            </p>
          ) : null}
        </>
      ) : null}
    </li>
  )
}

export function PrivacyOperatorScreen({
  client,
  locale,
}: {
  client: StaffPrivacyClient
  locale: Locale
}) {
  const [requests, setRequests] = useState<PrivacyRequests | null>(null)

  useEffect(() => {
    let alive = true
    void client
      .requests()
      .then((body) => alive && setRequests(body))
      // An empty queue and an unreachable one look the same here, which is acceptable for
      // a read-only board and is why nothing on this screen claims "all clear".
      .catch(() => alive && setRequests({ exports: [], deletions: [] }))
    return () => {
      alive = false
    }
  }, [client])

  if (requests === null) return null

  const rows = [...requests.exports, ...requests.deletions].sort((a, b) => {
    const aFailed = a.status === 'failed' ? 0 : 1
    const bFailed = b.status === 'failed' ? 0 : 1
    if (aFailed !== bFailed) return aFailed - bFailed
    return b.created_at.localeCompare(a.created_at)
  })
  const failed = rows.filter((row) => row.status === 'failed').length

  return (
    <div data-testid="privacy-operator" style={{ ...columnStyle, gap: 'var(--space-4)' }}>
      <PageHeader
        subtitle={t(locale, 'reports.privacy.requests.operatorSubtitle')}
        title={t(locale, 'reports.privacy.requests.operatorTitle')}
      />
      {failed > 0 ? (
        <Card>
          <p style={{ margin: 0 }}>
            {t(locale, 'reports.privacy.requests.needsAttention')}:{' '}
            <strong data-testid="privacy-failed-count">
              <bdi dir="ltr">{failed}</bdi>
            </strong>
          </p>
        </Card>
      ) : null}
      <Card>
        {rows.length === 0 ? (
          <EmptyState title={t(locale, 'reports.privacy.requests.empty')} />
        ) : (
          <ul style={{ ...columnStyle, listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row) => (
              <Row key={row.id} locale={locale} row={row} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
