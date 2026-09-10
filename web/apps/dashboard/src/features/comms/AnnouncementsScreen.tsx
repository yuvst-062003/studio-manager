// Dashboard artboard `4f` — הודעות, rebuilt against the prototype's own `AnnouncementsView`.
//
// **The first pass had the shape inside out.** It made the four-step wizard the page and
// left the sent announcements as a bare list underneath. The prototype is the other way
// round: the page IS the feed — a header, a band of figures, a filter-and-search bar, then
// one rich card per broadcast — and the wizard is a MODAL the send button opens over it.
// That is also the right shape for the job: a manager opens this screen to see what went
// out far more often than to send something new.
//
// In the prototype's own order: a header with its mark and its send button · a band of
// figures · a pill row and a search box in one bar · the feed · the wizard as a modal.
//
// **The figures are ours, not the prototype's.** §3.12 forbids porting its "98.4% delivery"
// and "148 connected" cards — both hardcoded there — and names what belongs in that band
// instead: "`InstallState` and `DeliveryReport` are strong features stacked below a
// composer where nobody scrolls. The prototype's KPI-card treatment is the right home for
// their headline numbers." A family with no app installed receives no push whatever the
// delivery report says afterwards, and that is the number worth seeing BEFORE sending.
//
// **The filters are ours too.** The prototype filters on urgent / sent / scheduled. There is
// no urgency column, so that pill is gone; the other two are real, and so is the third
// state between them. `AnnouncementOut` carries `scheduled_for` beside `published_at`
// precisely because — in the schema's own words — "three states matter and they are three
// different next actions: a draft to finish, a send that is queued, and one that has
// already gone out and now has a delivery report". That is what the owner asked this page
// to show: *"he can see in the front page all the history and timed msgs"*.
//
// The artboard's own two rules still hold and are now the composer's: the audience size is
// fetched before there is a row to hang it off, because a manager who cannot see
// `יגיע ל-24 משפחות` before pressing send is guessing at twenty-four families; and a lead
// coach is offered only their own groups, because a picker offering a scope the API will
// refuse is a 403 discovered after the message is written.
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { EmptyState, Icon, LoadFailed } from '@studio/ui'
import type { IconName } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { AnnouncementComposer } from './AnnouncementComposer'
import { DeliveryReport } from './DeliveryReport'
import { InstallState } from './InstallState'
import type {
  AnnouncementOut,
  AnnouncementScope,
  DashboardCommsClient,
  InstallStateOut,
} from './dashboardCommsClient'

export type ScopeOption = { id: string; name: string; type: 'class' | 'group' }

const pageStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-4)',
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

/** The three states an announcement actually has, plus "everything". No `urgent`: there is
 *  no urgency column, and a pill filtering on a field we do not store is the prototype's
 *  hardcoded-count mistake in another costume. */
const FILTERS = ['all', 'published', 'scheduled', 'draft'] as const
type Filter = (typeof FILTERS)[number]

export type AnnouncementState = 'published' | 'scheduled' | 'draft'

/** One glyph and one word per state, so the card never has to spell the mapping inline —
 *  and so a fourth state cannot be added to one of them and forgotten in the other. */
const STATE_ICON: Record<AnnouncementState, IconName> = {
  published: 'messages',
  scheduled: 'clock',
  draft: 'documents',
}

const STATE_WORD: Record<AnnouncementState, string> = {
  published: 'comms.state.published',
  scheduled: 'comms.state.scheduled',
  draft: 'comms.announcement.draft',
}

/**
 * Which of the three an announcement is in. `published_at` wins over `scheduled_for`,
 * because a timed message keeps the moment it was scheduled for after `publish_due` fires
 * it — a row with both set has already gone out, and calling it "queued" would offer a
 * manager a cancel button for something twenty-four phones already have.
 */
export function announcementState(row: {
  published_at?: string | null
  scheduled_for?: string | null
}): AnnouncementState {
  if (row.published_at != null) return 'published'
  return row.scheduled_for != null ? 'scheduled' : 'draft'
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
  canPublishStudioWide: boolean
}) {
  const [rows, setRows] = useState<AnnouncementOut[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [scopeType, setScopeType] = useState<AnnouncementScope>(
    canPublishStudioWide ? 'studio' : 'group',
  )
  const [scopeId, setScopeId] = useState<string | null>(null)
  // Keyed to the scope it was fetched for, so a count for the group a manager just
  // navigated away from can never be read as the current one.
  const [audience, setAudience] = useState<{ scope: string; count: number } | null>(null)
  const [selected, setSelected] = useState<AnnouncementOut | null>(null)
  const [sent, setSent] = useState(false)
  const [sending, setSending] = useState(false)
  const [composing, setComposing] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  // Best-effort, the same way `InstallState` reads it: this band must never be the reason
  // the feed does not render.
  const [install, setInstall] = useState<InstallStateOut | null>(null)
  const [copied, setCopied] = useState<string | null>(null)

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

  useEffect(() => {
    let live = true
    client
      .installState()
      .then((state) => live && setInstall(state))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client])

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

  const send = useCallback(
    async (title: string, body: string, scheduledFor: string | null) => {
      setSending(true)
      try {
        const created = await client
          .create({
            title,
            body,
            scope_type: scopeType,
            scope_id: scopeType === 'studio' ? null : scopeId,
            scheduled_for: scheduledFor,
          })
          .catch(() => null)
        if (!created) return
        // A timed message is NOT published here. `publish_due` in `workers/notify.py`
        // fires it when its moment arrives — publishing now would send immediately and
        // leave `scheduled_for` sitting there as a description of something that already
        // happened. So the confirmation is "it is queued", and the row lands in the
        // מתוזמנות pill rather than in the history.
        const done = scheduledFor !== null ? created : await client.publish(created.id).catch(() => null)
        setSent(done !== null)
        await refresh()
        // Deliberately does NOT open the delivery report. A manager who has just sent a note
        // about a summer BBQ wants confirmation that it went, not a delivery audit — and a
        // report that appears after every send is one people learn to dismiss without
        // reading, which costs exactly the case it exists for.
      } finally {
        setSending(false)
      }
    },
    [client, scopeType, scopeId, refresh],
  )

  const counts = useMemo(
    () => ({
      all: rows.length,
      published: rows.filter((row) => announcementState(row) === 'published').length,
      scheduled: rows.filter((row) => announcementState(row) === 'scheduled').length,
      draft: rows.filter((row) => announcementState(row) === 'draft').length,
    }),
    [rows],
  )

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return rows.filter((row) => {
      if (filter !== 'all' && announcementState(row) !== filter) return false
      if (needle === '') return true
      return (
        row.title.toLowerCase().includes(needle) || (row.body ?? '').toLowerCase().includes(needle)
      )
    })
  }, [filter, query, rows])

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
      {/* ── 1. the header ──────────────────────────────────────────────────────────── */}
      <header className="comms-hero">
        <div className="comms-hero__text">
          <span className="comms-hero__eyebrow">
            <span aria-hidden="true" className="comms-hero__mark">
              <Icon name="messages" size={18} />
            </span>
            {t(locale, 'comms.hero.eyebrow')}
          </span>
          <h1 className="comms-hero__title">{t(locale, 'comms.announcement.title')}</h1>
          <p className="comms-hero__lead">{t(locale, 'comms.hero.lead')}</p>
        </div>
        <button
          className="comms-hero__send"
          data-testid="open-composer"
          onClick={() => {
            setSent(false)
            setComposing(true)
          }}
          type="button"
        >
          <Icon name="plus" size={18} />
          {t(locale, 'comms.announcement.create')}
        </button>
      </header>

      {/* ── 2. the figures ─────────────────────────────────────────────────────────── */}
      <div className="dash-kpis" data-testid="comms-kpis">
        <Kpi
          icon="messages"
          label={t(locale, 'comms.kpi.published')}
          testId="comms-kpi-published"
          value={counts.published}
        />
        <Kpi
          icon="clock"
          label={t(locale, 'comms.kpi.scheduled')}
          testId="comms-kpi-scheduled"
          tone={counts.scheduled > 0 ? 'pending' : undefined}
          value={counts.scheduled}
        />
        <Kpi
          icon="check"
          label={t(locale, 'comms.kpi.reachable')}
          testId="comms-kpi-reachable"
          tone="paid"
          value={install?.installed_count ?? '—'}
        />
        {/* The figure that matters before pressing send: a family with no app installed
            receives no push, whatever the delivery report says afterwards. */}
        <Kpi
          hint={t(locale, 'comms.kpi.unreachableHint')}
          icon="warning"
          label={t(locale, 'comms.kpi.unreachable')}
          testId="comms-kpi-unreachable"
          tone={(install?.not_installed_count ?? 0) > 0 ? 'debt' : undefined}
          value={install?.not_installed_count ?? '—'}
        />
      </div>

      {/* ── 3. the filter bar ──────────────────────────────────────────────────────── */}
      <div className="comms-bar">
        <div
          aria-label={t(locale, 'comms.filter.legend')}
          className="comms-bar__pills"
          data-testid="comms-filters"
          role="group"
        >
          {FILTERS.map((value) => (
            <button
              aria-pressed={filter === value}
              data-testid={`comms-filter-${value}`}
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {t(locale, `comms.filter.${value}`)}
              <span className="comms-bar__count">{counts[value]}</span>
            </button>
          ))}
        </div>
        <label className="comms-bar__search">
          <span className="studio-visually-hidden">{t(locale, 'comms.search.label')}</span>
          <Icon name="search" size={16} />
          <input
            data-testid="comms-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(locale, 'comms.search.placeholder')}
            type="search"
            value={query}
          />
        </label>
      </div>

      {/* ── 4. the feed ────────────────────────────────────────────────────────────── */}
      {loaded && rows.length === 0 ? (
        <EmptyState title={t(locale, 'comms.announcement.empty')} />
      ) : null}

      {loaded && rows.length > 0 && shown.length === 0 ? (
        // A filter that matches nothing is a different sentence from "nothing was ever
        // sent", and saying the second when the first is true is how a manager concludes
        // their announcements have disappeared.
        <EmptyState title={t(locale, 'comms.filter.noMatch')} />
      ) : null}

      <ul className="comms-feed" data-testid="comms-feed">
        {shown.map((row) => {
          const state = announcementState(row)
          const published = state === 'published'
          return (
            <li
              className="comms-card"
              data-published={published ? 'true' : undefined}
              data-state={state}
              data-testid={`announcement-${row.id}`}
              key={row.id}
            >
              <div className="comms-card__head">
                <span aria-hidden="true" className="comms-card__badge">
                  <Icon name={STATE_ICON[state]} size={18} />
                </span>
                <div className="comms-card__titles">
                  <div className="comms-card__title-row">
                    <h2 className="comms-card__title">{row.title}</h2>
                    <span className="comms-card__state">{t(locale, STATE_WORD[state])}</span>
                  </div>
                  <p className="comms-card__meta">
                    <span>
                      {t(locale, 'comms.audience.title')}:{' '}
                      <strong>{t(locale, `comms.audience.${row.scope_type}`)}</strong>
                    </span>
                    {published ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span dir="ltr">
                          {new Date(row.published_at as string).toLocaleString(locale)}
                        </span>
                      </>
                    ) : null}
                    {/* A queued message's moment. Without it the card says "מתוזמן" and
                        leaves a manager to guess whether that means tonight or next
                        month — the one fact a timed row exists to carry. */}
                    {state === 'scheduled' ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span data-testid={`scheduled-${row.id}`}>
                          {t(locale, 'comms.announcement.scheduledFor')}{' '}
                          <strong dir="ltr">
                            {new Date(row.scheduled_for as string).toLocaleString(locale)}
                          </strong>
                        </span>
                      </>
                    ) : null}
                  </p>
                </div>
                {/* D7 — one live channel, so one badge. The prototype shows three because it
                    has three; three here would be three promises, two of them false. */}
                <span className="comms-card__channels">
                  <span className="comms-channel-badge">
                    <Icon name="messages" size={13} />
                    {t(locale, 'comms.channel.push')}
                  </span>
                </span>
              </div>

              {row.body ? <p className="comms-card__body">{row.body}</p> : null}

              <div className="comms-card__foot">
                {/* The prototype's copy button, and a real `navigator.clipboard` call
                    rather than its toast. */}
                <button
                  className="comms-card__action"
                  data-testid={`copy-${row.id}`}
                  onClick={() => {
                    void navigator.clipboard?.writeText?.(row.body ?? row.title)
                    setCopied(row.id)
                  }}
                  type="button"
                >
                  <Icon name="documents" size={14} />
                  {t(locale, copied === row.id ? 'comms.card.copied' : 'comms.card.copy')}
                </button>
                {/* Its "re-broadcast" is a toast; §3.12 says make it real with the existing
                    endpoint or leave it out. It is real — but `POST /announcements/{id}/resend`
                    retries the FAILED sends only, which is why the label says that rather
                    than "send again": a button promising a re-broadcast and delivering a
                    retry of five failures is the same lie in the other direction. A draft
                    and a queued message have nothing to retry — nothing has gone anywhere
                    yet — so neither this nor the report is drawn on either. */}
                {published ? (
                  <>
                    <button
                      className="comms-card__action"
                      data-testid={`resend-${row.id}`}
                      onClick={() => void client.resend(row.id).catch(() => undefined)}
                      type="button"
                    >
                      <Icon name="sync" size={14} />
                      {t(locale, 'comms.card.retryFailed')}
                    </button>
                    <button
                      className="comms-card__action"
                      data-testid={`delivery-${row.id}`}
                      onClick={() => setSelected(row)}
                      type="button"
                    >
                      <Icon name="reports" size={14} />
                      {t(locale, 'comms.delivery.title')}
                    </button>
                  </>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      {selected ? <DeliveryReport announcement={selected} client={client} locale={locale} /> : null}

      {/* §6.5 puts this beside the delivery report, so the screen does too. The band above
          carries its two headline numbers; this is the list of WHO, with phone numbers,
          because calling is the only remaining channel. */}
      <InstallState client={client} locale={locale} />

      {/* ── 5. the composer, as a drawer beside the feed ───────────────────────────── */}
      {composing ? (
        <AnnouncementComposer
          canPublishStudioWide={canPublishStudioWide}
          locale={locale}
          onClose={() => setComposing(false)}
          onScope={(type, id) => {
            setScopeType(type)
            setScopeId(id)
          }}
          onSend={send}
          recipientCount={recipientCount}
          scopeId={scopeId}
          scopeType={scopeType}
          scopes={scopes}
          sending={sending}
          sent={sent}
        />
      ) : null}
    </div>
  )
}

/** One figure in the band, in the same `.dash-kpi` shape the home and collections use. */
function Kpi({
  label,
  value,
  hint,
  icon,
  tone,
  testId,
}: {
  label: string
  value: number | string
  hint?: string
  icon: IconName
  tone?: 'debt' | 'paid' | 'pending'
  testId: string
}) {
  return (
    <div className="dash-kpi" data-testid={testId} data-tone={tone}>
      <div className="dash-kpi__head">
        <span className="dash-kpi__text">
          <span className="dash-kpi__label">{label}</span>
          <span className="dash-kpi__figures">
            <span className="dash-kpi__value">{value}</span>
          </span>
        </span>
        <span aria-hidden="true" className="dash-kpi__badge">
          <Icon name={icon} size={18} />
        </span>
      </div>
      {hint ? (
        <div className="dash-kpi__foot">
          <span className="dash-kpi__note">{hint}</span>
        </div>
      ) : null}
    </div>
  )
}
