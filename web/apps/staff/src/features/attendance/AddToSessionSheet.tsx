// "Who else is on the mat right now?" — one popup with the two honest answers
// (owner, 2026-10-13).
//
// **The case this exists for.** A child turns up to a session their own group does not
// train, or trains an extra one. Until now the roster could only offer הוספת חניך לשיעור,
// which opened a page for a brand-new TRIAL child — so a manager looking at a student who is
// already in the club had to invent one, or leave them unmarked. Both are worse records than
// the truth.
//
// **What marking a visitor means**, settled by the owner against two alternatives: attendance
// only. The child is present at THIS session and nothing about their enrollment, plan or
// billing moves, and the visit is not counted against their own attendance percentage —
// §5.14's denominator is expected sessions and a visit is not one. Moving them to this group
// permanently is a different act with its own flow (מעבר כיתה on the student card).
//
// **And the trial form came along**, because it was the other half of the same question and
// it was a page for no reason — the owner's second ask in the same breath: "adding a new
// student should be a popup, not a new page".
//
// The search is `GET /students?q=`, which §3.2 scopes server-side: a manager searches the
// whole club, a coach searches their own groups. That is the right answer for both without
// this screen knowing the rule.
import { useEffect, useState } from 'react'
import { Search, UserPlus, X } from 'lucide-react'
import { useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { TrialInClass } from '../people'
import type { StaffPeopleClient, StudentSummary } from '../people'

type Tab = 'existing' | 'trial'

export function AddToSessionSheet({
  locale,
  peopleClient,
  onPickStudent,
  onClose,
  trialGroupId,
  trialSessionId,
  canGrantTrialOverride = false,
  alreadyOnRoster,
}: {
  locale: Locale
  peopleClient: StaffPeopleClient
  /** Mark this student present at the session as a visitor. The roster screen owns the
   *  queueing, so this sheet never touches the offline store. */
  onPickStudent: (student: StudentSummary) => void
  onClose: () => void
  /** The session's own group, for §5.4a's trial form on the second tab. */
  trialGroupId?: string | null
  trialSessionId?: string
  /** §5.4a — a second free trial is a MANAGER's deliberate act. A coach is told to ask. */
  canGrantTrialOverride?: boolean
  /** Students already drawn on the roster — offering to add them again would be a tap that
   *  does nothing a coach can see. */
  alreadyOnRoster: ReadonlySet<string>
}) {
  const dialogRef = useModalDialog(true, onClose)
  const [tab, setTab] = useState<Tab>('existing')
  const [query, setQuery] = useState('')
  const [club, setClub] = useState<StudentSummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  // **The whole club, the moment this opens** (owner, 2026-10-13). It used to ask the server
  // only after two characters were typed, which on a group with NOBODY enrolled — every one
  // of this club's extra groups — meant opening the sheet onto an empty list with no way to
  // see anybody: "I cannot filter all the students at all, and when I search for a student I
  // cannot find him."
  //
  // An empty `q` is what the server already answers with everyone, scoped by §3.2 to what
  // the caller may see: a manager gets the club, a coach gets their own groups. One request
  // on open, and the typing filters what came back — a club is a few hundred names at most,
  // and a filter that runs on the device answers on the first letter instead of the third.
  useEffect(() => {
    let alive = true
    peopleClient
      .search('')
      .then((body) => alive && setClub(body.items))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [peopleClient])

  const needle = query.trim().toLowerCase()
  const results = (club ?? [])
    .filter((student) => !alreadyOnRoster.has(student.id))
    .filter((student) =>
      needle === ''
        ? true
        : `${student.first_name ?? ''} ${student.last_name ?? ''}`.toLowerCase().includes(needle),
    )

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-to-session-title"
        tabIndex={-1}
        data-testid="add-to-session-sheet"
        className="tw-scope bg-[var(--surface-raised)] w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl border border-[var(--border)] space-y-4"
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-8 h-8 rounded-xl bg-[var(--emphasis-tint)] text-[var(--emphasis)] flex items-center justify-center shrink-0">
              <UserPlus className="w-4 h-4" aria-hidden="true" />
            </span>
            <h2 id="add-to-session-title" className="text-sm font-black text-[var(--fg)] truncate">
              {t(locale, 'attendance.addToSession.title')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t(locale, 'people.profile.close')}
            data-testid="add-to-session-close"
            className="w-9 h-9 rounded-lg bg-[var(--disabled-surface)] text-[var(--text-muted)] flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div role="tablist" aria-label={t(locale, 'attendance.addToSession.title')} className="flex gap-1.5">
          {(['existing', 'trial'] as const).map((each) => (
            <button
              key={each}
              type="button"
              role="tab"
              aria-selected={tab === each}
              data-testid={`add-to-session-tab-${each}`}
              onClick={() => setTab(each)}
              className={`flex-1 min-h-11 rounded-xl text-xs font-bold transition-colors ${
                tab === each
                  ? 'bg-[var(--emphasis)] text-[var(--on-emphasis)]'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border)]'
              }`}
            >
              {t(locale, `attendance.addToSession.${each}`)}
            </button>
          ))}
        </div>

        {tab === 'existing' ? (
          <div className="space-y-3" data-testid="add-to-session-existing">
            <p className="text-[11px] text-[var(--text-muted)] m-0">
              {t(locale, 'attendance.addToSession.existingHint')}
            </p>
            <label className="block">
              <span className="block text-[11px] font-bold text-[var(--text-secondary)]">
                {t(locale, 'people.student.search')}
              </span>
              <span className="relative block mt-1">
                <Search
                  className="w-4 h-4 absolute inset-inline-start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  data-testid="add-to-session-search"
                  value={query}
                  onChange={(event) => setQuery(event.currentTarget.value)}
                  placeholder={t(locale, 'people.search.placeholder')}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                />
              </span>
            </label>

            {club === null && !failed ? (
              <p className="text-[11px] text-[var(--text-muted)] m-0">
                {t(locale, 'common.state.loading')}
              </p>
            ) : null}

            {failed ? (
              <p className="text-[11px] text-[var(--danger)] m-0" data-testid="add-to-session-failed">
                {t(locale, 'common.loadFailed.body')}
              </p>
            ) : null}

            {club !== null && results.length === 0 ? (
              <p className="text-[11px] text-[var(--text-muted)] m-0" data-testid="add-to-session-none">
                {t(locale, 'people.student.empty')}
              </p>
            ) : null}

            <ul className="list-none m-0 p-0 flex flex-col gap-1.5">
              {results.map((student) => (
                <li key={student.id}>
                  <button
                    type="button"
                    data-testid={`add-to-session-pick-${student.id}`}
                    onClick={() => onPickStudent(student)}
                    className="w-full p-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex items-center justify-between gap-3 text-start active:scale-[0.99] transition-transform"
                  >
                    <span className="flex flex-col min-w-0">
                      <span className="font-bold text-[var(--fg)] truncate">
                        <bdi>
                          {student.first_name} {student.last_name}
                        </bdi>
                      </span>
                      {student.group_names && student.group_names.length > 0 ? (
                        <span className="text-[11px] text-[var(--text-muted)] truncate">
                          <bdi>{student.group_names.join(' · ')}</bdi>
                        </span>
                      ) : null}
                    </span>
                    <UserPlus className="w-4 h-4 text-[var(--emphasis)] shrink-0" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div data-testid="add-to-session-trial">
            {trialGroupId ? (
              <TrialInClass
                canGrantOverride={canGrantTrialOverride}
                client={peopleClient}
                groupId={trialGroupId}
                locale={locale}
                sessionId={trialSessionId}
                // **The child is marked present, not merely booked** (owner, 2026-10-13):
                // "a manager needs to be able to write a name and add attendance". A trial
                // booking records `attended` on itself and writes no attendance row, so the
                // name a coach had just written down was absent from the roster in front of
                // them. The same visitor path a club child takes, from the other tab.
                onLogged={(created) =>
                  onPickStudent({
                    id: created.id,
                    first_name: created.first_name,
                    last_name: created.last_name,
                  } as unknown as StudentSummary)
                }
              />
            ) : (
              <p data-testid="trial-loading">{t(locale, 'common.setup.loading')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
