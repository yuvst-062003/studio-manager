// עדכונים — the redesigned updates tab, composed. Checkpoint 3 of the parent-app redesign.
//
// It replaces `InboxScreen`, and the replacement is a real decision rather than a refresh.
// `InboxScreen` was screen 7 of the STITCH redesign and its arrangement — one card at a
// time, a queue with the rest swipeable behind it — was the owner's pick on 2026-09-01. The
// prototype supersedes that source (memory: the AI Studio prototypes replace Stitch from
// 2026-09-05), and it draws three labelled sections and a filter strip instead.
//
// WHAT SURVIVES THE REPLACEMENT, because it was never about the arrangement:
//
//  - ONE-WAY. §2.3 puts in-app two-way chat out of scope, so there is no compose box, no
//    reply and no sender on a row. The prototype has none either; this is a note, not a cut.
//  - OUTSTANDING vs READ ARE DIFFERENT QUESTIONS. `read_at` cleared demands a parent had
//    only glanced at; `action.outstanding` is resolved server-side against the records that
//    settle it. `classify.ts` keeps that split and `חדש` marks only rows that ask nothing.
//  - THE PUSH BANNER. §5.11 wants it where the messages are: the parent looking at an empty
//    inbox is exactly the one who needs to know their doorbell is off. The prototype has no
//    such thing and cannot — it has no push. Dropping it would be losing a decision, not
//    following a design.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { formatDateInStudioZone } from '@studio/core'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { PushDisabledBanner } from '../PushDisabledBanner'
import { usePushRegistration } from '../usePushRegistration'
import { ACTIONS } from '../InboxScreen'
import type { ParentCommsClient } from '../commsClient'
import { UpdatesFeed } from './UpdatesFeed'
import { applyFilter, classify, pendingCountOf, waitingCountOf } from './classify'
import type { ActionCatalogue, Notification } from './classify'
import type { UpdateFilter } from './types'

export function UpdatesScreen({
  locale,
  client,
  childrenById,
  childNames,
  onReadChange,
}: {
  locale: Locale
  client: ParentCommsClient
  /** The family's children, `id → first name`. Used only to name a notification's subject
   *  when the server did not; see `subjectNameOf`. */
  childrenById: Readonly<Record<string, string>>
  /** First names, for the per-child filter chips. */
  childNames: readonly string[]
  onReadChange?: () => void
}) {
  const [rows, setRows] = useState<readonly Notification[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [cursor, setCursor] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [filter, setFilter] = useState<UpdateFilter>({ kind: 'all' })
  const push = usePushRegistration(client)

  // The words come from @studio/i18n, the routes from the ONE map `InboxScreen` also reads.
  const catalogue: ActionCatalogue = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(ACTIONS).map(([kind, entry]) => [
          kind,
          { label: t(locale, entry.labelKey), href: entry.route },
        ]),
      ),
    [locale],
  )

  const load = useCallback(
    (after: string | null) => {
      void client
        .inbox(after)
        .then((page) => {
          setFailed(false)
          setRows((current) =>
            after === null ? page.items : [...(current ?? []), ...page.items],
          )
          setCursor(page.next_cursor)
          setHasMore(page.has_more)
        })
        .catch(() => {
          setFailed(true)
          // `null` stays `null` on a FIRST failure so the screen shows its failure state
          // rather than an empty feed, which claims the club has never written to you.
          setRows((current) => current)
        })
    },
    [client],
  )

  useEffect(() => {
    load(null)
  }, [load])

  const groups = useMemo(
    () => classify(rows ?? [], childrenById, catalogue),
    [rows, childrenById, catalogue],
  )
  const visible = useMemo(() => applyFilter(groups, filter), [groups, filter])

  // Reading is a side effect of ACTING, not of scrolling past. A feed that marked everything
  // read on render would clear the tab badge for a parent who never looked at a single row,
  // and the badge is the only thing that brings them back.
  const markRead = useCallback(
    (id: string) => {
      setRows((current) =>
        (current ?? []).map((row) =>
          row.id === id ? { ...row, read_at: new Date().toISOString() } : row,
        ),
      )
      void client.markRead(id).catch(() => undefined)
      onReadChange?.()
    },
    [client, onReadChange],
  )

  const markAllRead = useCallback(() => {
    const now = new Date().toISOString()
    setRows((current) => (current ?? []).map((row) => (row.read_at ? row : { ...row, read_at: now })))
    void client.markAllRead().catch(() => undefined)
    onReadChange?.()
  }, [client, onReadChange])

  return (
    <section aria-label={t(locale, 'comms.inbox.title')} data-testid="parent-updates">
      {/* Above the feed, as §5.11 asks. It renders nothing when push is on or impossible. */}
      <div className="tw-scope px-4 pt-4">
        <PushDisabledBanner locale={locale} state={push.state} />
      </div>

      <UpdatesFeed
        groups={visible}
        filter={filter}
        onFilterChange={setFilter}
        childNames={childNames}
        pendingCount={pendingCountOf(groups)}
        waitingCount={waitingCountOf(groups)}
        unreadCount={[...groups.club, ...groups.personal].filter((row) => row.isNew).length}
        state={failed && rows === null ? 'failed' : rows === null ? 'loading' : 'ready'}
        onRetry={() => load(null)}
        hasMore={hasMore}
        onLoadMore={() => load(cursor)}
        onOpen={markRead}
        onMarkAllRead={markAllRead}
        dateLabel={(createdAt) => formatDateInStudioZone(createdAt, locale)}
      />
    </section>
  )
}
