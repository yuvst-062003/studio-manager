// Ported from the AI Studio prototype's UpdatesScreen.tsx (lines 166-538): the header
// (title, live dot, counter pill, category filter strip) and the three-section feed
// (urgent actions, club announcements, personal updates) plus the empty-feed state. See
// docs/superpowers/specs/2026-09-03-onboarding-doors-and-wizard.md's sibling prompt for the
// porting rules this file follows — Tailwind classes kept as written, physical directional
// utilities turned logical, every string from `content.ts`, no date math, no modals.
//
// The prototype hand-writes two cards per section for one family (Noa/Yossi/Dana). Each
// section here is a `.map` over its `UpdateGroups` array instead, using that section's
// FIRST card as the literal markup template for every row (per the porting spec) and
// picking the icon + accent color from `row.kind` via KIND_STYLE below, rather than
// keeping two hand-written card bodies.
//
// Departures from the source, beyond the mechanical porting rules, and why:
//
// - The health-declaration card's two reds (`#e02424` on the border, `#cf1322` on the tile
//   and status text) and the tournament card's one blue (`#1351d8` everywhere) are the only
//   two accent bundles the prototype actually uses. KIND_STYLE below reuses those two exact
//   bundles verbatim rather than deriving a bundle from an arbitrary hex per kind — the
//   classes below are the same strings the prototype already wrote, just picked by a map
//   instead of a healthSigned/tournamentRegistered pair of booleans.
// - Section 3's belt-exam card drew its belt as a hardcoded emerald bar
//   (`<div className="w-6 h-2.5 bg-emerald-600 ..." />`), not an icon — a one-off visual
//   gag for exactly one belt colour. KIND_STYLE's `belt_exam -> Award` entry replaces that
//   bar with the standard icon+accent tile treatment used everywhere else, which is also
//   what lets a `payment`-kind personal row (the receipt card) render correctly from the
//   SAME template instead of needing the receipt card's own markup kept around.
// - The announcement card's sender line ("הנהלת המועדון" + a dot) and the club/personal
//   section's trailing note ("כלל המתאמנים", "מעקב ילדים") are hardcoded prototype strings
//   with no `UPDATES.*` entry and no field on `UpdateRow` to source them from. Per the
//   porting rule against inlining ungrounded strings, they are dropped rather than invented
//   — see the report back to the caller for the full list.
// - The announcement card's bookmark toggle needed local state (`bookmarkedMap`) the
//   prototype kept in `UpdatesScreen`. This component takes no `useState` and has no
//   bookmark prop or `UpdateRow` field to read one from, so the bookmark button is dropped.
// - The empty state's "show all updates" button had no `UPDATES.*` string of its own,
//   either. It reuses `UPDATES.filterAll` ("הכל") and calls `onFilterChange({ kind: 'all' })`
//   — close enough to the prototype's intent to avoid a dead-end empty screen without
//   inventing new copy.
import {
  AlertCircle,
  Award,
  Bell,
  Calendar,
  Check,
  ChevronLeft,
  FileEdit,
  Megaphone,
  Receipt,
  Trophy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import { fill, UPDATES } from './content'
import type { UpdateGroups, UpdateFilter } from './types'

type KindStyle = {
  Icon: LucideIcon
  /** `border-inline-end` + tile background/text + status-text color, as one bundle so a
   *  row's accent is always internally consistent. */
  border: string
  tile: string
  status: string
}

const RED: KindStyle = {
  Icon: FileEdit,
  border: 'border-s-[#e02424]',
  tile: 'bg-[#feecee] text-[#cf1322]',
  status: 'text-[#cf1322]',
}

const BLUE = (Icon: LucideIcon): KindStyle => ({
  Icon,
  border: 'border-s-[#1351d8]',
  tile: 'bg-blue-50 text-[#1351d8]',
  status: 'text-[#1351d8]',
})

const KIND_STYLE: Record<string, KindStyle> = {
  health_declaration: RED,
  health_renewal: RED,
  event_rsvp: BLUE(Trophy),
  payment: BLUE(Receipt),
  belt_exam: BLUE(Award),
  belt: BLUE(Award),
  schedule: BLUE(Calendar),
  closure: BLUE(Calendar),
}

const DEFAULT_KIND_STYLE = BLUE(Megaphone)

function styleForKind(kind: string): KindStyle {
  return KIND_STYLE[kind] ?? DEFAULT_KIND_STYLE
}

/** Shared by both the urgent chip (font-medium) and the personal chip (font-semibold) — the
 *  caller passes its own base classes and this only ever overrides the color. */
function isNewPill(baseClassName: string) {
  return <span className={`bg-[#feecee] text-[#cf1322] ${baseClassName}`}>{UPDATES.isNew}</span>
}

const STATE_SHELL = 'text-center py-12 px-4 space-y-3'
const STATE_ICON_WRAP =
  'w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400'

export function UpdatesFeed({
  groups,
  filter,
  onFilterChange,
  childNames,
  pendingCount,
  waitingCount,
  unreadCount,
  state,
  onRetry,
  hasMore,
  onLoadMore,
  onOpen,
  onMarkAllRead,
  dateLabel,
}: {
  /** Already filtered and classified by the container. */
  groups: UpdateGroups
  filter: UpdateFilter
  onFilterChange: (next: UpdateFilter) => void
  /** The family's children, first names, for the per-child filter chips. The prototype
   *  hardcodes three ("נועה", "יוסי", "דנה"); these are real and there may be one or six. */
  childNames: readonly string[]
  /** Rows that still REQUIRE AN ACTION. Badges the דורש פעולה chip, which shows exactly
   *  those, so the number and what it labels are the same set. */
  pendingCount: number
  /** Everything not dealt with — outstanding actions PLUS unopened notices. The header pill
   *  uses this because the TAB BAR's badge does, and the two are on screen together; a pill
   *  reading 1 beside a tab reading 2 is a product arguing with itself. */
  waitingCount: number
  /** How many rows carry the חדש mark, which is what "mark all read" would clear. */
  unreadCount: number
  state: 'ready' | 'loading' | 'failed'
  onRetry: () => void
  hasMore: boolean
  onLoadMore: () => void
  /** Called with a row's id when its action is followed — reading is a side effect of
   *  ACTING, never of scrolling past. */
  onOpen: (id: string) => void
  /** The only way to clear the חדש mark on a notice that asks for nothing. The prototype has
   *  no equivalent because it has no read state at all; without it the tab badge would count
   *  announcements forever. */
  onMarkAllRead: () => void
  /** A row's `createdAt` → a formatted date. Studio zone, done by the caller. */
  dateLabel: (createdAt: string) => string
}) {
  const totalVisible = groups.urgent.length + groups.club.length + groups.personal.length

  return (
    <div className="flex flex-col min-h-screen pb-28 bg-[#f7f9fd]" data-testid="updates-feed">
      {/* Top Header */}
      <header className="pt-6 px-4 pb-3" data-purpose="top-header">
        <div className="flex items-center justify-between gap-2">
          {/* Title and Live Status Indicator */}
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3" aria-hidden="true">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-[#e02424]"></span>
            </span>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">{UPDATES.title}</h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Not in the prototype, and it has to be somewhere: `חדש` is the only thing
                keeping an announcement in the tab bar's badge, and a notice that asks for
                nothing can never be "done" by doing it. Shown only when there is something
                to clear, so it is absent on the screen a settled family sees. */}
            {/* Counter Pill Badge. `waitingCount`, not `pendingCount` — see the prop's note. */}
            <div
              data-testid="updates-count"
              className={`px-3 py-1 rounded-full text-xs font-semibold tracking-normal flex items-center shadow-xs transition-colors ${
                waitingCount > 0 ? 'bg-[#feecee] text-[#cf1322]' : 'bg-emerald-50 text-emerald-800'
              }`}
            >
              {waitingCount > 0 ? fill(UPDATES.pendingCount, { count: waitingCount }) : UPDATES.allClear}
            </div>
          </div>
        </div>

        {/* Category Filter Strip */}
        <nav aria-label={UPDATES.filterLabel} className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <button
            type="button"
            data-testid="updates-filter-all"
            aria-pressed={filter.kind === 'all'}
            onClick={() => onFilterChange({ kind: 'all' })}
            className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-semibold transition-all cursor-pointer ${
              filter.kind === 'all'
                ? 'bg-[#0d1d3a] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80'
            }`}
          >
            {UPDATES.filterAll}
          </button>

          <button
            type="button"
            data-testid="updates-filter-action"
            aria-pressed={filter.kind === 'action'}
            onClick={() => onFilterChange({ kind: 'action' })}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
              filter.kind === 'action'
                ? 'bg-[#0d1d3a] text-white font-semibold shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80'
            }`}
          >
            <span>{UPDATES.filterAction}</span>
            {pendingCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-[#e02424] text-white text-[10px] flex items-center justify-center font-bold">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            data-testid="updates-filter-club"
            aria-pressed={filter.kind === 'club'}
            onClick={() => onFilterChange({ kind: 'club' })}
            className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
              filter.kind === 'club'
                ? 'bg-[#0d1d3a] text-white font-semibold shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80'
            }`}
          >
            {UPDATES.filterClub}
          </button>

          {childNames.map((name) => {
            const isActive = filter.kind === 'child' && filter.name === name
            return (
              <button
                key={name}
                type="button"
                data-testid={`updates-filter-child-${name}`}
                aria-pressed={isActive}
                onClick={() => onFilterChange({ kind: 'child', name })}
                className={`whitespace-nowrap px-3.5 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#0d1d3a] text-white font-semibold shadow-xs'
                    : 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200/80'
                }`}
              >
                {name}
              </button>
            )
          })}
        </nav>

        {/* Under the filter strip, not in the header: adding a third control to that row
            wrapped the title onto two lines. Shown only when there is something to clear. */}
        {unreadCount > 0 ? (
          <div className="flex justify-start pt-1">
            <button
              type="button"
              onClick={onMarkAllRead}
              data-testid="updates-mark-all-read"
              className="text-[11px] font-medium text-slate-500 hover:text-slate-700 underline underline-offset-2 transition-colors cursor-pointer"
            >
              {UPDATES.markAllRead}
            </button>
          </div>
        ) : null}
      </header>

      {/* Main Content Feed */}
      <main className="px-4 space-y-6 flex-1 pb-6">
        {state === 'loading' ? (
          <div className={STATE_SHELL}>
            <div className={STATE_ICON_WRAP}>
              <Bell className="w-7 h-7" />
            </div>
            <h4 className="font-bold text-slate-700">{UPDATES.loading}</h4>
          </div>
        ) : state === 'failed' ? (
          <div className={STATE_SHELL}>
            <div className={STATE_ICON_WRAP}>
              <Bell className="w-7 h-7" />
            </div>
            <h4 className="font-bold text-slate-700">{UPDATES.loadFailed}</h4>
            <button
              type="button"
              onClick={onRetry}
              className="text-xs font-semibold text-[#0056c5] hover:underline"
            >
              {UPDATES.retry}
            </button>
          </div>
        ) : (
          <>
            {/* SECTION 1: Urgent Actions */}
            {groups.urgent.length > 0 && (
              <section
                aria-labelledby="updates-heading-urgent"
                className="space-y-3"
                data-purpose="urgent-actions-group"
                data-testid="updates-section-urgent"
              >
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-1.5 text-[#e02424]">
                    <AlertCircle className="w-5 h-5 text-[#e02424] fill-[#e02424]/10" />
                    <h2 id="updates-heading-urgent" className="font-bold text-base text-[#e02424]">
                      {UPDATES.urgentHeading}
                    </h2>
                  </div>
                  <span className="text-xs text-slate-500 font-medium">{UPDATES.urgentNote}</span>
                </div>

                {groups.urgent.map((row) => {
                  const settled = row.action !== null && row.action.outstanding === false
                  const style = styleForKind(row.kind)
                  const Icon = style.Icon

                  return (
                    <article
                      key={row.id}
                      data-testid={`updates-row-${row.id}`}
                      className={`bg-white rounded-2xl p-4 shadow-xs border border-slate-100 border-s-4 flex items-center justify-between gap-3 transition-all hover:shadow-md ${
                        settled ? 'border-s-emerald-500 bg-emerald-50/20' : style.border
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div
                          className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                            settled ? 'bg-emerald-100 text-emerald-700' : style.tile
                          }`}
                        >
                          {settled ? <Check className="w-6 h-6" /> : <Icon className="w-6 h-6" />}
                        </div>
                        <div className="space-y-1 flex-1 text-start">
                          <div className="flex items-center gap-2 flex-wrap">
                            {row.subjectName !== null && (
                              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-xs font-medium">
                                {row.subjectName}
                              </span>
                            )}
                            {row.isNew && isNewPill('px-2 py-0.5 rounded text-xs font-medium')}
                            <h3 className="text-base font-bold text-slate-900 leading-snug">{row.title}</h3>
                          </div>
                          <p className={`text-xs font-semibold ${settled ? 'text-emerald-700' : style.status}`}>
                            {row.body}
                          </p>
                        </div>
                      </div>

                      {settled ? (
                        <span className="text-sm font-medium px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs shrink-0 bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default">
                          <Check className="w-4 h-4 text-emerald-600" />
                          <span>{UPDATES.settled}</span>
                        </span>
                      ) : row.action !== null && row.action.href !== null ? (
                        <a
                          onClick={() => onOpen(row.id)}
                          href={row.action.href}
                          data-testid={`updates-action-${row.id}`}
                          className="text-sm font-medium px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition-transform shrink-0 cursor-pointer bg-[#0f1f3d] hover:bg-slate-800 active:scale-95 text-white"
                        >
                          <Icon className="w-4 h-4" />
                          <span>{row.action.label}</span>
                        </a>
                      ) : null}
                    </article>
                  )
                })}
              </section>
            )}

            {/* SECTION 2: Club Announcements */}
            {groups.club.length > 0 && (
              <section
                aria-labelledby="updates-heading-club"
                className="space-y-3"
                data-purpose="club-announcements-group"
                data-testid="updates-section-club"
              >
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-1.5 text-slate-900">
                    <Megaphone className="w-5 h-5 text-blue-600" />
                    <h2 id="updates-heading-club" className="font-bold text-base text-slate-900">
                      {UPDATES.clubHeading}
                    </h2>
                  </div>
                  {/* The prototype's trailing caption on the heading row — who the section
                      is about. Static, so it ports as written. */}
                  <span className="text-xs text-slate-500 font-medium">{UPDATES.clubNote}</span>
                </div>

                {groups.club.map((row) => (
                  <article
                    key={row.id}
                    data-testid={`updates-row-${row.id}`}
                    className="bg-white rounded-2xl p-4 shadow-xs border border-slate-100 space-y-2.5 transition-all hover:shadow-md text-start"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                      <span className="font-bold text-slate-700">{dateLabel(row.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-slate-900 leading-tight">{row.title}</h3>
                      {row.isNew && isNewPill('px-2 py-0.5 rounded text-xs font-medium')}
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">{row.body}</p>
                    {row.action !== null && row.action.href !== null ? (
                      <div className="pt-2 border-t border-slate-50 flex items-center justify-end">
                        <a
                          onClick={() => onOpen(row.id)}
                          href={row.action.href}
                          data-testid={`updates-action-${row.id}`}
                          className="text-sm font-semibold text-[#1351d8] hover:text-blue-800 flex items-center gap-1 cursor-pointer"
                        >
                          <span>{row.action.label}</span>
                          <ChevronLeft className="w-4 h-4" />
                        </a>
                      </div>
                    ) : null}
                  </article>
                ))}
              </section>
            )}

            {/* SECTION 3: Personal Updates */}
            {groups.personal.length > 0 && (
              <section
                aria-labelledby="updates-heading-personal"
                className="space-y-3"
                data-purpose="personal-updates-group"
                data-testid="updates-section-personal"
              >
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-1.5 text-slate-900">
                    <Award className="w-5 h-5 text-blue-600" />
                    <h2 id="updates-heading-personal" className="font-bold text-base text-slate-900">
                      {UPDATES.personalHeading}
                    </h2>
                  </div>
                  {/* The prototype's trailing caption on the heading row — who the section
                      is about. Static, so it ports as written. */}
                  <span className="text-xs text-slate-500 font-medium">{UPDATES.personalNote}</span>
                </div>

                {groups.personal.map((row) => {
                  const style = styleForKind(row.kind)
                  const Icon = style.Icon

                  return (
                    <article
                      key={row.id}
                      data-testid={`updates-row-${row.id}`}
                      className={`bg-white rounded-2xl p-4 shadow-xs border border-slate-100 border-s-4 ${style.border} flex items-center justify-between gap-3 transition-all hover:shadow-md text-start`}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${style.tile}`}>
                          <Icon className="w-5 h-5" />
                        </div>
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2">
                            {row.subjectName !== null && (
                              <span className="bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded text-xs font-semibold">
                                {row.subjectName}
                              </span>
                            )}
                            {row.isNew && isNewPill('px-2 py-0.5 rounded text-xs font-semibold')}
                            <h3 className="text-sm font-bold text-slate-900 leading-tight">{row.title}</h3>
                          </div>
                          <p className="text-xs text-slate-500 font-medium">{row.body}</p>
                        </div>
                      </div>
                      {/* A SETTLED action shows that it is settled and offers nothing. Its
                          label is a verb — "לתשלום", "חתימה" — and printing it beside a bill
                          already paid invites a second payment. `טופל` is the whole answer. */}
                      {row.action !== null && !row.action.outstanding ? (
                        <span
                          data-testid={`updates-settled-${row.id}`}
                          className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1 shrink-0"
                        >
                          <Check className="w-4 h-4" />
                          <span>{UPDATES.settled}</span>
                        </span>
                      ) : row.action !== null && row.action.href !== null ? (
                        <a
                          onClick={() => onOpen(row.id)}
                          href={row.action.href}
                          data-testid={`updates-action-${row.id}`}
                          className="bg-[#eef2f9] hover:bg-blue-100 active:scale-95 text-blue-900 text-xs font-semibold px-3 py-2 rounded-xl flex items-center gap-1 transition-transform shrink-0 cursor-pointer"
                        >
                          <span>{row.action.label}</span>
                          <ChevronLeft className="w-4 h-4" />
                        </a>
                      ) : null}
                    </article>
                  )
                })}
              </section>
            )}

            {/* Empty Feed State */}
            {totalVisible === 0 && (
              <div className={STATE_SHELL} data-testid="updates-empty">
                <div className={STATE_ICON_WRAP}>
                  <Bell className="w-7 h-7" />
                </div>
                <h4 className="font-bold text-slate-700">
                  {filter.kind !== 'all' ? UPDATES.emptyFiltered : UPDATES.emptyTitle}
                </h4>
                {filter.kind === 'all' && (
                  <p className="text-xs text-slate-500 max-w-xs mx-auto">{UPDATES.emptyBody}</p>
                )}
                {filter.kind !== 'all' && (
                  <button
                    type="button"
                    onClick={() => onFilterChange({ kind: 'all' })}
                    className="text-xs font-semibold text-[#0056c5] hover:underline"
                  >
                    {UPDATES.filterAll}
                  </button>
                )}
              </div>
            )}

            {hasMore && (
              <div className="text-center pt-2">
                <button
                  type="button"
                  data-testid="updates-load-more"
                  onClick={onLoadMore}
                  className="text-xs font-semibold text-[#0056c5] hover:underline"
                >
                  {UPDATES.loadMore}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
