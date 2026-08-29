// Dashboard artboard `4f` — הודעות: קהל יעד ותצוגה מקדימה.
//
// The artboard's own name says what the screen is for: choosing WHO, and seeing what they will
// see. Both halves exist because §5.11's failure modes are silent in both directions — too
// wide and the club messages families who left, too narrow and a cancellation misses the
// children who will turn up to it, and the publisher sees "sent" either way.
//
// **The audience size is fetched before there is a row to hang it off.** A manager who cannot
// see `יגיע ל-24 משפחות` before pressing send is guessing at twenty-four families.
//
// **The preview shows the lock-screen line, not just the inbox row.** The OS truncates a push
// title, and a manager who has never seen that writes a title nobody can read on the screen it
// matters on.
//
// **A lead coach is offered only their own groups.** §3.2 — and a picker offering a scope the
// API will refuse is a 403 the manager discovers after writing the message.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Button, Card, EmptyState, LoadFailed, SegmentedControl, TextField } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { DeliveryReport } from './DeliveryReport'
import { InstallState } from './InstallState'
import type {
  AnnouncementOut,
  AnnouncementScope,
  DashboardCommsClient,
} from './dashboardCommsClient'

export type ScopeOption = { id: string; name: string; type: 'class' | 'group' }

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-2)',
}

// 2026-08-30 (owner request) — the preview beside the composer, not under it: at the
// INLINE-END, so it sits on the left of a Hebrew screen and the right of an English one.
// `auto-fit` collapses the two columns on a phone; DOM order keeps the composer first,
// which in RTL puts it on the right and the preview on the left with no branch.
const composerGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))',
  gap: 'var(--space-5)',
  alignItems: 'start',
}

const titleStyle: CSSProperties = {
  color: 'var(--fg)',
  fontSize: 'var(--text-title)',
  fontWeight: 'var(--weight-medium)',
  margin: 0,
}

const hintStyle: CSSProperties = {
  color: 'var(--text-secondary)',
  fontSize: 'var(--text-caption)',
  margin: 0,
}

const lineStyle: CSSProperties = { color: 'var(--fg)', margin: 0 }

const lockScreenStyle: CSSProperties = {
  background: 'var(--surface-raised, var(--surface))',
  border: 'var(--border-width-hairline) solid var(--border)',
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-3)',
  textAlign: 'start',
}

/**
 * What a lock screen actually shows. iOS and Android both truncate a push, and the numbers
 * differ per device — so this is a representative bound rather than a promise, and its job is
 * to make a manager notice that their title is too long BEFORE twenty-four phones get it.
 */
export const PUSH_TITLE_BUDGET = 40

export function truncateForLockScreen(text: string, budget = PUSH_TITLE_BUDGET): string {
  return text.length <= budget ? text : `${text.slice(0, budget - 1)}…`
}

export function AnnouncementsScreen({
  client,
  locale,
  scopes,
  canPublishStudioWide,
}: {
  client: DashboardCommsClient
  locale: Locale
  /** The classes and groups this publisher may reach. §3.2 narrows it for a lead coach. */
  scopes: readonly ScopeOption[]
  /** False for a lead coach: "their own groups" is the whole grant. */
  canPublishStudioWide: boolean
}) {
  const [rows, setRows] = useState<AnnouncementOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [scopeType, setScopeType] = useState<AnnouncementScope>(
    canPublishStudioWide ? 'studio' : 'group',
  )
  const [scopeId, setScopeId] = useState<string | null>(null)
  // Keyed to the scope it was fetched for, so a count for the group a manager just
  // navigated away from can never be read as the current one.
  const [audience, setAudience] = useState<{ scope: string; count: number } | null>(null)
  const [selected, setSelected] = useState<AnnouncementOut | null>(null)
  const [sent, setSent] = useState(false)

  const refresh = useCallback(async () => {
    const page = await client.list().catch(() => null)
    if (page) setRows(page.items)
    setLoaded(true)
  }, [client])

  useEffect(() => {
    let live = true
    client
      .list()
      .then((page) => {
        if (!live) return
        setRows(page.items)
        setLoaded(true)
      })
      // F1a — a failed load must not masquerade as loaded-and-empty.
      .catch(() => live && setLoadFailed(true))
    return () => {
      live = false
    }
  }, [client, attempt])

  const audienceChosen = scopeType === 'studio' || scopeId !== null
  const scopeKey = `${scopeType}:${scopeId ?? ''}`

  // The count follows the SCOPE and nothing else — it is not debounced against the title,
  // because a manager retyping a subject should not make the audience number flicker.
  useEffect(() => {
    if (!audienceChosen) return
    let live = true
    client
      .audienceSize(scopeType, scopeType === 'studio' ? null : scopeId)
      .then((result) => live && setAudience({ scope: scopeKey, count: result.recipient_count }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, scopeType, scopeId, scopeKey, audienceChosen])

  // A count fetched for a different scope is not this scope's answer, so it reads as absent
  // rather than as a number.
  const recipientCount = audience !== null && audience.scope === scopeKey ? audience.count : null
  const canSend = title.trim() !== '' && body.trim() !== '' && audienceChosen

  const scopeChoices = useMemo(
    () => scopes.filter((option) => option.type === scopeType),
    [scopes, scopeType],
  )

  const send = useCallback(async () => {
    const created = await client
      .create({
        title,
        body,
        scope_type: scopeType,
        scope_id: scopeType === 'studio' ? null : scopeId,
      })
      .catch(() => null)
    if (!created) return
    const published = await client.publish(created.id).catch(() => null)
    setTitle('')
    setBody('')
    setSent(published !== null)
    await refresh()
    // Deliberately does NOT open the delivery report. A manager who has just sent a note
    // about a summer BBQ wants confirmation that it went, not a delivery audit — and a
    // report that appears after every send is one people learn to dismiss without reading,
    // which costs exactly the case it exists for.
  }, [client, title, body, scopeType, scopeId, refresh])

  if (loadFailed) {
    return (
      <LoadFailed
        locale={locale}
        onRetry={() => {
          setLoadFailed(false)
          setAttempt((n) => n + 1)
        }}
      />
    )
  }

  return (
    <div style={pageStyle} data-testid="dashboard-announcements">
      <h1 style={titleStyle}>{t(locale, 'comms.announcement.title')}</h1>

      <Card>
        <section style={composerGridStyle} aria-labelledby="composer-title">
        <div style={sectionStyle}>
          <h2 id="composer-title" style={titleStyle}>
            {t(locale, 'comms.announcement.create')}
          </h2>

          <TextField
            label={t(locale, 'comms.announcement.subject')}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
          <TextField
            label={t(locale, 'comms.announcement.body')}
            multiline
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            value={body}
          />

          {/* -- קהל יעד ------------------------------------------------------ */}
          <h3 style={titleStyle}>{t(locale, 'comms.audience.title')}</h3>
          {canPublishStudioWide ? null : (
            <p style={hintStyle}>{t(locale, 'comms.audience.limitedToOwnGroups')}</p>
          )}
          <SegmentedControl
            legend={t(locale, 'comms.audience.title')}
            onValueChange={(next) => {
              setScopeType(next as AnnouncementScope)
              setScopeId(null)
            }}
            options={[
              // A lead coach never sees the studio-wide option: §5.11's grant is "their own
              // groups", and offering a scope the API will refuse is a 403 discovered after
              // the message is written.
              ...(canPublishStudioWide
                ? [{ value: 'studio', label: t(locale, 'comms.audience.studio') }]
                : []),
              ...(canPublishStudioWide
                ? [{ value: 'class', label: t(locale, 'comms.audience.class') }]
                : []),
              { value: 'group', label: t(locale, 'comms.audience.group') },
            ]}
            value={scopeType}
          />

          {scopeType === 'studio' ? null : (
            <div style={sectionStyle}>
              {scopeChoices.map((option) => (
                <Button
                  key={option.id}
                  onClick={() => setScopeId(option.id)}
                  variant={scopeId === option.id ? 'primary' : 'secondary'}
                >
                  {option.name}
                </Button>
              ))}
            </div>
          )}

          {audienceChosen && recipientCount !== null ? (
            <p style={lineStyle} data-testid="audience-size">
              {t(locale, 'comms.audience.recipients').replace('{{count}}', String(recipientCount))}
            </p>
          ) : (
            <p style={hintStyle} data-testid="audience-none">
              {t(locale, 'comms.audience.none')}
            </p>
          )}

          <Button disabled={!canSend} onClick={() => void send()}>
            {t(locale, 'comms.announcement.publish')}
          </Button>
          {sent ? (
            <p style={lineStyle} data-testid="announcement-sent">
              {t(locale, 'comms.announcement.published')}
            </p>
          ) : null}
        </div>

        {/* -- תצוגה מקדימה — its own inline-end column (owner request 2026-08-30):
            left of a Hebrew composer, right of an English one, under it on a phone. -- */}
        <aside style={sectionStyle} data-testid="preview-pane" aria-labelledby="preview-title">
          <h3 id="preview-title" style={titleStyle}>
            {t(locale, 'comms.preview.title')}
          </h3>
          <p style={hintStyle}>{t(locale, 'comms.preview.pushLine')}</p>
          <div style={lockScreenStyle} data-testid="push-preview">
            <strong style={lineStyle}>{truncateForLockScreen(title)}</strong>
            <span style={hintStyle}>{truncateForLockScreen(body, 60)}</span>
          </div>
          <p style={hintStyle}>{t(locale, 'comms.preview.asParent')}</p>
          <div style={lockScreenStyle} data-testid="inbox-preview">
            <strong style={lineStyle}>{title}</strong>
            <span style={lineStyle}>{body}</span>
          </div>
        </aside>
        </section>
      </Card>

      {/* -- what has already gone out ------------------------------------------ */}
      {loaded && rows.length === 0 ? (
        <EmptyState title={t(locale, 'comms.announcement.empty')} />
      ) : null}

      {rows.map((row) => (
        <Card key={row.id}>
          <button
            disabled={row.published_at === null}
            onClick={() => setSelected(row)}
            style={{
              background: 'none',
              border: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-1)',
              inlineSize: '100%',
              padding: 0,
              textAlign: 'start',
            }}
            type="button"
            data-testid={`announcement-${row.id}`}
          >
            <strong style={lineStyle}>{row.title}</strong>
            <span style={hintStyle}>
              {/* A draft has nothing to report, so it says so and offers nothing. A published
                  one names what the click opens rather than leaving the row mysteriously
                  tappable. */}
              {row.published_at === null
                ? t(locale, 'comms.announcement.draft')
                : t(locale, 'comms.delivery.title')}
            </span>
          </button>
        </Card>
      ))}

      {selected ? <DeliveryReport announcement={selected} client={client} locale={locale} /> : null}

      {/* §6.5 puts this beside the delivery report, so the screen does too. */}
      <InstallState client={client} locale={locale} />
    </div>
  )
}
