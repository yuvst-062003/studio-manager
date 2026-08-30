// §11.3, §11.4 and §11.6 on one screen, reachable from the parent app's drawer.
//
// Nothing rendered `privacy.*` before this file: `grep -rln "privacy\." web/apps
// --include="*.tsx"` returned nothing, so a complete set of Hebrew, English and Russian
// strings sat in `reports.ts` with no screen behind them, and four working endpoints sat in
// `app/routers/privacy.py` with no caller.
//
// **The whole screen is built around `failed`.** `app/workers/privacy.py`'s two work
// functions are named seams that raise on purpose (HB-privacy-worker-unbuilt): the export
// bundle is not assembled and the purge deletes nothing. So a request made today ends
// `failed` with a reason, and this screen says so in the guardian's own language, with the
// worker's reason underneath it for whoever has to answer them. `deletion_request` carries
// no constraint that could catch a false success — "the data is gone" is not a column — so
// a screen that rendered `failed` as "in progress" would be the last thing standing
// between a guardian and being told their child's data was erased when it was not.
//
// RTL: logical properties only, and every timestamp goes through `formatDate`, which
// renders Asia/Jerusalem from a UTC instant.
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, LoadFailed, PageHeader, SectionHeader, StatusChip } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { DraftNotice, PolicyDocument } from './PolicyDocument'
import type { ConsentState, PrivacyClient, PrivacyRequest, PrivacyRequests } from './privacyClient'

const columnStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const rowStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 'var(--space-2)',
  alignItems: 'center',
}

/** SPEC G3: stored UTC, rendered Asia/Jerusalem. Never `toLocaleString()` with no zone. */
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

/**
 * `pending` and `running` are the only two that are genuinely in flight. Everything else
 * is an outcome, and `failed` is the outcome the worker actually produces today.
 */
function chipStatus(status: string): 'pending' | 'paid' | 'debt' | 'cancelled' {
  if (status === 'completed') return 'paid'
  if (status === 'failed') return 'debt'
  if (status === 'expired') return 'cancelled'
  return 'pending'
}

function RequestRow({ locale, row }: { locale: Locale; row: PrivacyRequest }) {
  const isExport = row.kind === 'export'
  const statusKey = isExport
    ? `reports.privacy.export.status.${row.status}`
    : `reports.privacy.delete.status.${row.status}`
  const failedHelp = isExport
    ? 'reports.privacy.export.failedHelp'
    : 'reports.privacy.delete.failedHelp'
  return (
    <li data-testid={`privacy-request-${row.id}`} style={{ ...columnStyle, gap: 'var(--space-1)' }}>
      <div style={rowStyle}>
        <strong>
          {t(
            locale,
            isExport ? 'reports.privacy.requests.kind.export' : 'reports.privacy.requests.kind.deletion',
          )}
        </strong>
        <StatusChip label={t(locale, statusKey)} status={chipStatus(row.status)} />
      </div>
      <p style={{ margin: 0, color: 'var(--text-muted)' }}>
        {t(locale, 'reports.privacy.requests.requestedAt')}{' '}
        {/* A formatted date is digits and separators in the middle of Hebrew copy. */}
        <bdi>{formatDate(row.created_at, locale)}</bdi>
      </p>
      {row.status === 'failed' ? (
        <>
          <p style={{ margin: 0 }}>{t(locale, failedHelp)}</p>
          {row.error ? (
            <p style={{ margin: 0, color: 'var(--text-muted)' }}>
              {t(locale, 'reports.privacy.export.failedReason')}:{' '}
              {/* The worker's own message. English, technical, and shown anyway: the
                  person who has to answer the guardian needs the sentence the machine
                  wrote, not a translation of it. */}
              <bdi dir="ltr">{row.error}</bdi>
            </p>
          ) : null}
        </>
      ) : null}
      {/* NO download link, deliberately. §11.3's bundle lives in object storage and no
          endpoint serves those bytes, so a button here would be a button to nothing —
          which is the same class of claim as a `completed` erasure that erased nothing.
          When `assemble_export_bundle` and its download route land, this is where the link
          goes, and PrivacyScreen.test.tsx is the test that says so. */}
    </li>
  )
}

export function PrivacyScreen({
  client,
  locale,
  personId,
}: {
  client: PrivacyClient
  locale: Locale
  /**
   * The signed-in person, from the active membership. `null` only when the session has no
   * membership to read one from — the documents and the request list still render, and the
   * two buttons that need a subject do not.
   */
  personId: string | null
}) {
  const [requests, setRequests] = useState<PrivacyRequests | null>(null)
  const [consents, setConsents] = useState<ConsentState | null>(null)
  const [confirmingDeletion, setConfirmingDeletion] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showDocuments, setShowDocuments] = useState(false)

  // A counter rather than a `reload()` the buttons await: the read has to run on mount AND
  // after every write, and one effect keyed on a token does both without a second code
  // path — and without a `setState` in the effect body, which D10's hook rules refuse
  // because it cascades renders.
  const [reloadToken, setReloadToken] = useState(0)

  const [requestsFailed, setRequestsFailed] = useState(false)

  useEffect(() => {
    let alive = true
    void Promise.all([
      // P8 — a swallowed failure here rendered "no requests", which for a screen about
      // deletion rights is a lie with legal weight. Failure is its own state now.
      client.requests().then(
        (list) => ({ list, failed: false }),
        () => ({ list: { exports: [], deletions: [] }, failed: true }),
      ),
      client.consents().catch(() => null),
    ]).then(([outcome, state]) => {
      if (!alive) return
      setRequestsFailed(outcome.failed)
      setRequests(outcome.list)
      setConsents(state)
    })
    return () => {
      alive = false
    }
  }, [client, reloadToken])

  const rows: PrivacyRequest[] = requests
    ? [...requests.exports, ...requests.deletions].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      )
    : []

  const act = async (fn: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    try {
      await fn()
      setReloadToken((token) => token + 1)
    } catch {
      // A failed POST leaves the list as it was. The screen's job is never to invent a
      // request that the server did not accept.
    } finally {
      setBusy(false)
    }
  }

  const photoDecision = consents?.records
    .filter((record) => record.consent_type === 'photo_video')
    .at(-1)

  if (requests === null) return null

  return (
    <div data-testid="privacy-screen" style={columnStyle}>
      <PageHeader
        subtitle={t(locale, 'reports.privacy.screen.subtitle')}
        title={t(locale, 'reports.privacy.title')}
      />

      {/* §11.3 */}
      <Card caption={t(locale, 'reports.privacy.export.title')}>
        <p style={{ marginBlockStart: 0 }}>{t(locale, 'reports.privacy.export.description')}</p>
        <p style={{ color: 'var(--text-muted)' }}>
          {t(locale, 'reports.privacy.export.preparingHint')}
        </p>
        {personId ? (
          <Button
            data-testid="export-request"
            disabled={busy}
            onClick={() => void act(() => client.requestExport(personId))}
            variant="secondary"
          >
            {t(locale, 'reports.privacy.export.request')}
          </Button>
        ) : null}
      </Card>

      {/* §11.4 — destructive and irreversible, and the copy says both before the button
          that does it exists. Two taps, and the second one lives in a panel that has to be
          opened first. */}
      <Card caption={t(locale, 'reports.privacy.delete.title')}>
        <p style={{ marginBlockStart: 0 }}>
          {t(locale, 'reports.privacy.anonymize.whatHappens')}
        </p>
        <p style={{ color: 'var(--text-muted)' }}>
          {t(locale, 'reports.privacy.anonymize.whatRemains')}
        </p>
        <p>
          <strong>{t(locale, 'reports.privacy.anonymize.irreversible')}</strong>
        </p>
        {personId && !confirmingDeletion ? (
          <Button
            data-testid="deletion-request"
            disabled={busy}
            onClick={() => setConfirmingDeletion(true)}
            variant="destructive"
          >
            {t(locale, 'reports.privacy.delete.request')}
          </Button>
        ) : null}
        {personId && confirmingDeletion ? (
          <div style={columnStyle}>
            <p style={{ margin: 0 }}>
              <strong>{t(locale, 'reports.privacy.delete.confirmTitle')}</strong>
            </p>
            <p data-testid="deletion-confirm-body" style={{ margin: 0 }}>
              {t(locale, 'reports.privacy.delete.confirmBody')}
            </p>
            <div style={rowStyle}>
              <Button
                data-testid="deletion-confirm"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    // `deletion_request.reason` is a short machine string on the row —
                    // §11.4's own examples are `account_closure`, `gdpr_request`,
                    // `parent_request` — not the guardian's words.
                    await client.requestDeletion(personId, 'gdpr_request')
                    setConfirmingDeletion(false)
                  })
                }
                variant="destructive"
              >
                {t(locale, 'reports.privacy.delete.confirm')}
              </Button>
              <Button
                data-testid="deletion-cancel"
                onClick={() => setConfirmingDeletion(false)}
                variant="ghost"
              >
                {t(locale, 'reports.privacy.delete.cancel')}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      {/* §6.1 step 7, asked HERE and never inside the blocking gate. SPEC makes it
          skippable and "Skipping = NO consent recorded (the safe default)", so putting it
          behind a wall a parent is trying to get past would collect a yes that means
          nothing. Both answers write a NEW row (§11.6), so changing your mind is recorded
          rather than overwritten. */}
      <Card caption={t(locale, 'reports.privacy.photo.title')}>
        <p style={{ marginBlockStart: 0 }}>{t(locale, 'reports.privacy.photo.body')}</p>
        <p data-testid="photo-current" style={{ color: 'var(--text-muted)' }}>
          {photoDecision === undefined
            ? t(locale, 'reports.privacy.photo.notRecorded')
            : photoDecision.granted
              ? t(locale, 'reports.privacy.photo.allowed')
              : t(locale, 'reports.privacy.photo.notAllowed')}
        </p>
        {consents ? (
          <div style={rowStyle}>
            <Button
              data-testid="photo-allow"
              disabled={busy}
              onClick={() =>
                void act(() => client.grant(consents.policy_version, { photo_video: true }))
              }
              variant="secondary"
            >
              {t(locale, 'reports.privacy.photo.allow')}
            </Button>
            <Button
              data-testid="photo-disallow"
              disabled={busy}
              onClick={() =>
                void act(() => client.grant(consents.policy_version, { photo_video: false }))
              }
              variant="ghost"
            >
              {t(locale, 'reports.privacy.photo.disallow')}
            </Button>
          </div>
        ) : null}
      </Card>

      {/* The list. This is where a guardian finds out their erasure did not run. */}
      <Card caption={t(locale, 'reports.privacy.requests.title')}>
        {requestsFailed ? (
          <LoadFailed locale={locale} onRetry={() => setReloadToken((n) => n + 1)} />
        ) : rows.length === 0 ? (
          <EmptyState title={t(locale, 'reports.privacy.requests.empty')} />
        ) : (
          <ul style={{ ...columnStyle, listStyle: 'none', margin: 0, padding: 0 }}>
            {rows.map((row) => (
              <RequestRow key={row.id} locale={locale} row={row} />
            ))}
          </ul>
        )}
      </Card>

      {/* §11.6's ledger, as the person who made the decisions sees it. Versions and dates,
          because that is what the table is for. */}
      {consents && consents.records.length > 0 ? (
        <Card caption={t(locale, 'reports.privacy.consent.title')}>
          <ul style={{ ...columnStyle, gap: 'var(--space-1)', listStyle: 'none', margin: 0, padding: 0 }}>
            {consents.records.map((record, index) => (
              <li key={`${record.consent_type}-${record.granted_at}-${index}`} style={rowStyle}>
                <span>
                  {t(
                    locale,
                    record.consent_type === 'privacy'
                      ? 'reports.privacy.consent.type.privacy_policy'
                      : record.consent_type === 'photo_video'
                        ? 'reports.privacy.consent.type.photo'
                        : record.consent_type === 'medical_share'
                          ? 'reports.privacy.consent.type.medical_flags'
                          : 'reports.privacy.consent.type.terms',
                  )}
                </span>
                <StatusChip
                  label={t(
                    locale,
                    record.granted
                      ? 'reports.privacy.consent.givenAt'
                      : 'reports.privacy.consent.revokedRecorded',
                  )}
                  status={record.granted ? 'paid' : 'cancelled'}
                />
                <bdi>{formatDate(record.granted_at, locale)}</bdi>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* The document, collapsed — but the DRAFT notice is not.
          The wording has had no legal review, and that is a fact about what this family
          agreed to, so it stays on screen whether or not they expand the text. The
          document itself is open by default in the GATE, where the reader has not agreed
          to it yet; here they have, and it is reference material. */}
      <section style={columnStyle}>
        <SectionHeader
          action={
            <Button onClick={() => setShowDocuments((open) => !open)} variant="ghost">
              {t(
                locale,
                showDocuments ? 'reports.privacy.gate.hide' : 'reports.privacy.gate.show',
              )}
            </Button>
          }
          title={t(locale, 'reports.privacy.screen.documents')}
        />
        {consents?.policy_is_draft !== false ? (
          <DraftNotice label={consents?.policy_version_label ?? ''} locale={locale} />
        ) : null}
        {showDocuments ? (
          <PolicyDocument
            // Not twice on one screen. The notice above is already rendered and a second
            // copy inside the expanded document would read as two different warnings.
            isDraft={false}
            locale={locale}
            versionLabel={consents?.policy_version_label ?? ''}
          />
        ) : null}
      </section>
    </div>
  )
}
