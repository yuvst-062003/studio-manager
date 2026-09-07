// §4.4's screen — `#/tasks`, checkpoint 8. The list itself is `useOpenTasks`'s; this file
// is only the chrome around it: the filter chips (drawn as §4.4 asks, "all / urgent /
// follow-up"), the empty state, one card anatomy shared by every kind, and (2026-09-06)
// the birthday section.
//
// **2026-09-06 — the card, properly ported.** The first pass drew every kind through
// `@studio/ui`'s generic `Card`/`StatusChip`/`Button`, which is exactly what read as "a
// generic list" rather than `~/Downloads/staff-app/src/components/TasksView.tsx`'s own
// three card bodies. This pass ports that anatomy — the badge pill, the `font-black`
// title, the tinted alert box, the icon-tile avatar, the bottom action row — onto the FIVE
// real kinds `deriveTasks.ts` produces, inside the `.tw-scope` wrapper `StaffShell`
// already provides (the same house style `TodayScreen.tsx`'s own "second pass, same day"
// note describes). Three adaptations, each because the prototype hardcodes three bespoke
// mock tasks and this screen draws one shape for any of five real kinds:
//
//   - The prototype's primary buttons are a black `Check`-icon "mark as handled" control
//     (`onCompleteTask`). No real kind here has that affordance — §4.4's whole point is
//     "no task table", so nothing can be marked done directly, only resolved by taking
//     the real action underneath (open the roster, get the health form signed, decide the
//     cash). Every kind whose `primaryAction` is a `link` therefore renders it as an
//     OPEN action instead — the same tinted, `ChevronLeft`-trailing button
//     `TodayScreen.tsx`'s own `openRoster`/`open-event-roster` already draw — never the
//     prototype's checkmark, which would claim a completion that cannot happen here.
//   - `missing_health_form`/`call_parent`'s real `primaryAction` is `ContactFamiliesButton`
//     (§4.9), not the prototype's raw `tel:`/`wa.me` links — reused rather than rebuilt,
//     per this checkpoint's own instruction not to write a second contact control. It
//     renders as `@studio/ui`'s own button, the one visual seam this port cannot close:
//     `ContactFamiliesButton` exposes no `className`/style hook to its trigger, and
//     restyling it here would be the second contact control this file was told not to
//     write.
//   - **`call_parent` ALSO gets a compact one-tap `tel:` button (2026-09-06), beside that
//     `ContactFamiliesButton`, not instead of it.** This is the one behaviour ported in
//     from the deleted `features/comms/AtRiskAlert.tsx` — see that lane's own barrel
//     (`features/comms/index.ts`) for why it is gone. A coach who has already decided to
//     call gets the same immediate dial that banner card gave; the WhatsApp/copy panel
//     stays for the times a call is not what is wanted. `task.contactPhone` (set only by
//     `callParentTasks`) drives this: a real number renders the dial button, `null`
//     renders `comms.atRisk.noPhone` — the exact rule `AtRiskAlert` shipped ("a link that
//     does nothing is worse than a sentence explaining why") — and `undefined` (every
//     other kind) renders neither.
//   - Badge/alert tint is chosen PER KIND rather than copied from one mock: the
//     prototype's own three examples are all rose, but five real kinds need to read apart
//     from each other at a glance. `close_session`/`missing_health_form`/`call_parent`
//     stay rose (mat-safety and personal follow-up, matching the prototype's own three
//     cards); the two manager rows get their own tint — amber for `cash_pending` (money),
//     blue for `health_review` (an administrative approval) — both already this app's own
//     vocabulary (the birthday section's amber, the filter chips' and `TodayScreen`'s own
//     blue "next up"/administrative tone), not an invented fourth colour.
//
// **The birthday section (decision reversed).** Previously left unbuilt on the grounds
// that the prototype's own `birthdayStudents` fixture is hand-authored and disconnected
// from any real date of birth — see `deriveBirthdays.ts`'s header for why that reasoning
// was about the fixture, not the feature, and why the owner reversed it. Built here from
// `StudentSummaryOut.birthdate`, which the students tab already fetches — no backend
// work, no new endpoint. It is NOT a task: no badge/scope pair, no bucket, not part of
// `useOpenTasks`'s list, and the "greeted" tick is a local acknowledgement
// (`birthdayGreetings.ts`), never a task record.
//
// **The refresh button stays absent.** In the prototype it only spins for 500ms and
// refetches nothing; every button on this screen still needs a real destination or a real
// handler, which a decorative spinner is not.
//
// **The birthday row's layout (2026-09-06 fix).** At the narrow end (≈420px) the subtitle
// (`"בעוד 2 ימים • ילדים מ..."`) truncated mid-word, and the greet button's full-text
// trigger left it barely any room. See `BirthdayRowView`'s own comments for the two
// changes: the subtitle wraps instead of truncating, and the greet trigger shrinks to an
// icon button the same size as the tick beside it.
import { useState } from 'react'
import type { CSSProperties } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  FileText,
  Gift,
  MessageCircle,
  Phone,
  ShoppingBag,
  Wallet,
} from 'lucide-react'
import { EmptyState, MoneyDisplay } from '@studio/ui'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ContactFamiliesButton } from '../contact'
import type { ContactFamily } from '../contact'
import type { StaffScheduleClient } from '../schedule/client'
import type { StaffPeopleClient } from '../people'
import type { StaffCommsClient } from '../comms'
import type { PromiseClient } from '../billing/promiseClient'
import type { TasksClient } from './tasksClient'
import { useOpenTasks } from './useOpenTasks'
import { openTaskCount } from './deriveTasks'
import type { TaskBucket, TaskCard, TaskKind } from './deriveTasks'
import { useBirthdays } from './useBirthdays'
import type { BirthdayRow } from './deriveBirthdays'

const noteStyle: CSSProperties = { color: 'var(--text-secondary)' }

// -- the card, by kind ---------------------------------------------------------------

/** The badge pill's tint. Rose for the three coach-facing kinds (mat safety and a
 *  personal follow-up — the prototype's own three cards are all rose); the two manager
 *  rows get their own colour so five kinds still read apart at a glance — see this file's
 *  own header for why amber/blue rather than a sixth invented tone. */
const KIND_BADGE_TINT: Record<TaskKind, string> = {
  close_session: 'bg-[var(--danger-tint)] text-[var(--danger)] border border-[var(--danger)]',
  missing_health_form: 'bg-[var(--danger-tint)] text-[var(--danger)] border border-[var(--danger)]',
  call_parent: 'bg-[var(--danger-tint)] text-[var(--danger)] border border-[var(--danger)]',
  // Emerald, its own tone. A גי to bring is the one row here that is not a problem — the
  // family paid, the item is in the office, and the coach only has to remember it. Giving
  // it rose would put "somebody may be about to train uninsured" and "pick up a bag on the
  // way out" in the same colour, which is how a colour stops meaning anything.
  bring_item: 'bg-[var(--paid-tint)] text-[var(--paid)] border border-[var(--paid)]',
  cash_pending: 'bg-[var(--pending-tint)] text-[var(--pending)] border border-[var(--pending)]',
  health_review: 'bg-[var(--emphasis-tint)] text-[var(--emphasis)] border border-[var(--emphasis)]',
}

const KIND_SCOPE_TINT: Record<TaskKind, string> = {
  close_session: 'text-[var(--text-muted)]',
  missing_health_form: 'text-[var(--danger)]',
  call_parent: 'text-[var(--text-muted)]',
  bring_item: 'text-[var(--paid)]',
  cash_pending: 'text-[var(--pending)]',
  health_review: 'text-[var(--emphasis)]',
}

/** The tinted "open X" link button — this port's replacement for the prototype's black
 *  `Check`-icon primary button, see this file's own header for why. */
const KIND_LINK_TINT: Record<TaskKind, string> = {
  close_session: 'border-[var(--danger)] text-[var(--danger)] bg-[var(--danger-tint)] hover:bg-[var(--danger-tint)]',
  missing_health_form: 'border-[var(--danger)] text-[var(--danger)] bg-[var(--danger-tint)] hover:bg-[var(--danger-tint)]',
  call_parent: 'border-[var(--danger)] text-[var(--danger)] bg-[var(--danger-tint)] hover:bg-[var(--danger-tint)]',
  bring_item: 'border-[var(--paid)] text-[var(--paid)] bg-[var(--paid-tint)] hover:bg-[var(--paid-tint)]',
  cash_pending: 'border-[var(--pending)] text-[var(--pending)] bg-[var(--pending-tint)] hover:bg-[var(--pending-tint)]',
  health_review: 'border-[var(--emphasis)] text-[var(--emphasis)] bg-[var(--emphasis-tint)] hover:bg-[var(--emphasis-tint)]',
}

/** The alert box's leading icon, one per kind — `AlertTriangle`/`Phone`/`FileText` are the
 *  prototype's own three (task-1/task-2/task-3 respectively); the two manager kinds reuse
 *  `FileText`/`Wallet` at their own tint rather than inventing two more glyphs. */
function AlertIcon({ kind }: { kind: TaskKind }) {
  const cls = 'w-4 h-4 shrink-0 mt-0.5'
  switch (kind) {
    case 'close_session':
      return <AlertTriangle className={`${cls} text-[var(--danger)]`} aria-hidden="true" />
    case 'call_parent':
      return <Phone className={`${cls} text-[var(--danger)]`} aria-hidden="true" />
    case 'missing_health_form':
      return <FileText className={`${cls} text-[var(--text-muted)]`} aria-hidden="true" />
    case 'bring_item':
      return <ShoppingBag className={`${cls} text-[var(--paid)]`} aria-hidden="true" />
    case 'cash_pending':
      return <Wallet className={`${cls} text-[var(--pending)]`} aria-hidden="true" />
    case 'health_review':
      return <FileText className={`${cls} text-[var(--emphasis)]`} aria-hidden="true" />
  }
}

function TaskCardView({ task, locale }: { task: TaskCard; locale: Locale }) {
  const hasAvatar = task.avatarInitials != null

  return (
    <article className="bg-[var(--surface-raised)] rounded-3xl p-4 shadow-sm border border-[var(--border)] relative overflow-hidden">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span
          className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${KIND_BADGE_TINT[task.taskKind]}`}
        >
          {task.badgeText}
        </span>
        <span className={`text-xs font-bold ${KIND_SCOPE_TINT[task.taskKind]}`}>
          <bdi>{task.scope}</bdi>
        </span>
      </div>

      {/* Student-scoped kinds (health form, call-parent, health-review) carry the
          two-letter initials avatar; `closeSessionTasks`/`cashPendingTasks` are about a
          session and the whole club respectively, so `avatarInitials` is unset and this
          falls back to the prototype's avatar-less task-1 layout. */}
      {hasAvatar ? (
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="text-base font-black text-[var(--fg)] m-0">
              <bdi>{task.title}</bdi>
            </p>
            {task.subtitle ? (
              <p className="text-xs text-[var(--text-muted)] mt-0.5 m-0">
                <bdi>{task.subtitle}</bdi>
              </p>
            ) : null}
          </div>
          <div
            className="w-10 h-10 rounded-2xl bg-[var(--emphasis-tint)] text-[var(--emphasis)] font-black text-xs flex items-center justify-center shrink-0"
            aria-hidden="true"
          >
            {task.avatarInitials}
          </div>
        </div>
      ) : (
        <div className="mb-3">
          <p className="text-lg font-black text-[var(--fg)] mb-0.5 m-0">
            <bdi>{task.title}</bdi>
          </p>
          {task.subtitle ? (
            <p className="text-xs font-medium text-[var(--text-muted)] m-0">
              <bdi>{task.subtitle}</bdi>
            </p>
          ) : null}
          {/* Cash only — `MoneyDisplay` already renders through `@studio/core`'s own
              formatter with `font-variant-numeric: tabular-nums` (`.studio-money`), the
              design system's own answer to "numerals read as numerals" for a money
              amount; this does not duplicate that with a second, competing font-mono. */}
          {task.moneyAgorot != null ? (
            <p className="text-lg font-black mt-1 m-0">
              <MoneyDisplay agorot={task.moneyAgorot} />
            </p>
          ) : null}
        </div>
      )}

      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 mb-3 flex items-start gap-2.5">
        <AlertIcon kind={task.taskKind} />
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed font-medium m-0">{task.alertText}</p>
      </div>

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        {task.primaryAction.kind === 'link' ? (
          <a
            href={task.primaryAction.href}
            onClick={task.primaryAction.onSelect}
            data-testid={`task-action-${task.id}`}
            className={`flex-1 min-w-[8rem] py-2.5 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 transition-all ${KIND_LINK_TINT[task.taskKind]}`}
          >
            <span>{task.primaryAction.label}</span>
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
          </a>
        ) : (
          // `ContactFamiliesButton` exposes no style hook to its own trigger — see this
          // file's own header for why that one seam stays `@studio/ui`'s look rather
          // than the prototype's `tel:`/`wa.me` buttons.
          <div className="flex-1 min-w-[8rem]" data-testid={`task-action-${task.id}`}>
            <ContactFamiliesButton
              locale={locale}
              triggerLabel={task.primaryAction.triggerLabel}
              title={task.primaryAction.title}
              message={task.primaryAction.message}
              resolveFamilies={task.primaryAction.resolveFamilies}
            />
          </div>
        )}
        {/* The ported one-tap dial (2026-09-06) — see this file's own header for why
            `call_parent` alone carries `contactPhone`. `undefined` (every other kind)
            renders nothing here; `null` means this specific family has no number, said
            plainly rather than rendering a dead link. */}
        {task.contactPhone !== undefined ? (
          task.contactPhone ? (
            <a
              href={`tel:${task.contactPhone}`}
              data-testid={`task-call-${task.id}`}
              aria-label={t(locale, 'comms.atRisk.contactParent')}
              className="w-10 h-10 rounded-xl bg-[var(--danger-tint)] text-[var(--danger)] hover:bg-[var(--danger-tint)] border border-[var(--danger)] flex items-center justify-center active:scale-90 transition-all shrink-0"
            >
              <Phone className="w-4 h-4" aria-hidden="true" />
            </a>
          ) : (
            <p
              data-testid={`task-no-phone-${task.id}`}
              className="text-[11px] text-[var(--text-muted)] font-medium m-0"
            >
              {t(locale, 'comms.atRisk.noPhone')}
            </p>
          )
        ) : null}
        {task.tick ? (
          <button
            type="button"
            onClick={task.tick.onTick}
            data-testid={`task-tick-${task.id}`}
            aria-label={task.tick.label}
            className="w-10 h-10 rounded-xl bg-[var(--emphasis-tint)] text-[var(--emphasis)] hover:bg-[var(--emphasis-tint)] border border-[var(--emphasis)] flex items-center justify-center active:scale-90 transition-all shrink-0"
          >
            <Check className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </article>
  )
}

// -- the birthday section --------------------------------------------------------------

/** One row's own WhatsApp panel — `ContactFamiliesButton` again, not a second contact
 *  control, with a message personalised per child (name + the age this birthday turns
 *  them) rather than the one shared message a task card's contact action sends. */
function BirthdayRowView({
  row,
  locale,
  greeted,
  onToggle,
  resolveFamilies,
}: {
  row: BirthdayRow
  locale: Locale
  greeted: boolean
  onToggle: () => void
  resolveFamilies: () => Promise<ContactFamily[]>
}) {
  const message = t(locale, 'tasks.birthday.greetingMessage')
    .replace('{{name}}', row.name)
    .replace('{{age}}', String(row.turningAge))

  return (
    <div
      data-testid={`birthday-row-${row.studentId}`}
      // `items-start`, not `items-center`: the subtitle below wraps rather than truncates
      // (2026-09-06 fix — a clipped word, e.g. "בעוד 2 ימים • ילדים מ...", is worse than a
      // two-line row), and a center-aligned row would then float the avatar and the
      // trailing controls oddly against a taller left column.
      className={`p-3 rounded-2xl border flex items-start justify-between gap-2 transition-all ${
        greeted ? 'bg-white/60 border-[var(--border)] opacity-75' : 'bg-[var(--surface-raised)] border-[var(--pending)] shadow-xs'
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div
          className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
            row.isToday ? 'bg-[var(--pending-tint)] text-[var(--pending)] ring-2 ring-amber-400' : 'bg-[var(--disabled-surface)] text-[var(--text-secondary)]'
          }`}
          aria-hidden="true"
        >
          {row.isToday ? '🎉' : '🥋'}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-black text-[var(--fg)]">
              <bdi>{row.name}</bdi>
            </span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--pending-tint)] text-[var(--pending)] border border-[var(--pending)] whitespace-nowrap">
              {t(locale, 'tasks.birthday.turningAge').replace('{{age}}', String(row.turningAge))}
            </span>
            {row.isToday ? (
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full bg-[var(--danger)] text-[var(--on-status)]">
                {row.dayLabel}
              </span>
            ) : null}
          </div>
          {/* Wraps rather than truncates (2026-09-06) — see this component's own header
              comment. At the narrow end (≈420px) the combined "in N days · group name"
              line is often longer than one line has room for, and a truncated word reads
              worse than a two-line subtitle. */}
          <span className="text-[11px] text-[var(--text-muted)] block mt-0.5 font-medium leading-snug">
            {row.isToday ? null : `${row.dayLabel} · `}
            <bdi>{row.groupLabel}</bdi>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* Local acknowledgement only — never "sent". §4.9's own rule 2 (opening
            WhatsApp is not proof anything was sent) applies here too, so this tick and
            `ContactFamiliesButton`'s own panel stay two independent controls: unlike the
            prototype, marking greeted is never a side effect of opening WhatsApp — a
            coach who opens the panel and changes their mind has ticked nothing. */}
        <button
          type="button"
          data-testid={`birthday-tick-${row.studentId}`}
          onClick={onToggle}
          aria-pressed={greeted}
          aria-label={t(locale, greeted ? 'tasks.birthday.tickLabelUndo' : 'tasks.birthday.tickLabel').replace(
            '{{name}}',
            row.name,
          )}
          title={greeted ? t(locale, 'tasks.birthday.greetedHint') : undefined}
          className={`w-8 h-8 rounded-xl border flex items-center justify-center transition-all ${
            greeted
              ? 'bg-[var(--paid)] text-[var(--on-status)] border-[var(--paid)]'
              : 'bg-[var(--surface)] text-[var(--text-muted)] border-[var(--border)] hover:text-[var(--text-secondary)]'
          }`}
        >
          <Check className="w-3.5 h-3.5" aria-hidden="true" />
        </button>

        <ContactFamiliesButton
          locale={locale}
          triggerLabel={t(locale, greeted ? 'tasks.birthday.greetAgain' : 'tasks.birthday.greetAction')}
          title={row.name}
          message={message}
          resolveFamilies={resolveFamilies}
          // 2026-09-06 — the default trigger (`@studio/ui`'s full-text `Button`) was
          // "disproportionately wide for the row": at the narrow end its label alone left
          // barely 140px for the name, badges and subtitle beside it, which is what forced
          // the truncation this component's own header describes fixing. `renderTrigger`
          // is the documented escape hatch for exactly this (`ContactFamiliesButton`'s own
          // docs: a caller whose design calls for a differently shaped trigger). Sized to
          // match the tick button beside it rather than inventing a third control size;
          // the visible label moves to `aria-label`/`title`, so the control stays
          // accessible with no text footprint.
          renderTrigger={({ onOpen }) => (
            <button
              type="button"
              onClick={onOpen}
              data-testid={`birthday-greet-${row.studentId}`}
              aria-label={t(locale, greeted ? 'tasks.birthday.greetAgain' : 'tasks.birthday.greetAction')}
              title={t(locale, greeted ? 'tasks.birthday.greetAgain' : 'tasks.birthday.greetAction')}
              className="w-8 h-8 rounded-xl border flex items-center justify-center transition-all bg-[var(--pending-tint)] text-[var(--pending)] border-[var(--pending)] hover:bg-[var(--pending-tint)] shrink-0"
            >
              <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        />
      </div>
    </div>
  )
}

function BirthdaySection({
  rows,
  locale,
  isGreeted,
  toggle,
  resolveFamilies,
}: {
  rows: BirthdayRow[]
  locale: Locale
  isGreeted: (row: BirthdayRow) => boolean
  toggle: (row: BirthdayRow) => void
  resolveFamilies: (studentId: string) => () => Promise<ContactFamily[]>
}) {
  // `AtRiskAlert`'s own precedent: nothing rather than a permanent empty panel — unlike
  // the task list, there is no "all done" milestone worth a card when no one's birthday
  // falls this week.
  if (rows.length === 0) return null
  return (
    <section
      aria-labelledby="birthday-section-title"
      data-testid="birthday-section"
      className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-yellow-500/10 rounded-3xl p-4 border border-[var(--pending)] shadow-xs relative overflow-hidden"
    >
      <div className="flex items-center gap-2 mb-2.5">
        <div
          className="w-8 h-8 rounded-xl bg-[var(--pending)] text-[var(--on-status)] flex items-center justify-center shadow-xs shrink-0"
          aria-hidden="true"
        >
          <Gift className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h2 id="birthday-section-title" className="text-sm font-black text-[var(--fg)] m-0">
              {t(locale, 'tasks.birthday.sectionTitle')}
            </h2>
            <span className="text-[10px] font-black bg-[var(--pending)] text-[var(--on-status)] px-1.5 py-0.5 rounded-full">
              {plural(locale, 'tasks.birthday.countBadge', rows.length)}
            </span>
          </div>
          <span className="text-[11px] text-[var(--text-muted)] font-medium block">
            {t(locale, 'tasks.birthday.sectionHint')}
          </span>
        </div>
      </div>

      <ul className="list-none m-0 p-0 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.studentId}>
            <BirthdayRowView
              row={row}
              locale={locale}
              greeted={isGreeted(row)}
              onToggle={() => toggle(row)}
              resolveFamilies={resolveFamilies(row.studentId)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

// -- the screen itself -------------------------------------------------------------

const FILTERS: { key: 'all' | TaskBucket; labelKey: string }[] = [
  { key: 'all', labelKey: 'tasks.filter.all' },
  { key: 'urgent', labelKey: 'tasks.filter.urgent' },
  { key: 'followUp', labelKey: 'tasks.filter.followUp' },
]

function FilterChip({
  filterKey,
  selected,
  text,
  count,
  onSelect,
  testId,
}: {
  filterKey: 'all' | TaskBucket
  selected: boolean
  text: string
  count: number
  onSelect: () => void
  testId: string
}) {
  const isAll = filterKey === 'all'
  const tone = isAll
    ? selected
      ? 'bg-black text-white shadow-sm'
      : 'bg-[var(--surface-raised)] text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--surface)]'
    : selected
      ? 'bg-[var(--emphasis)] text-[var(--on-emphasis)] shadow-sm'
      : 'bg-[var(--emphasis-tint)] text-[var(--emphasis)] border border-[var(--emphasis)] hover:bg-[var(--emphasis-tint)]'
  return (
    <button
      type="button"
      aria-pressed={selected}
      data-testid={testId}
      onClick={onSelect}
      className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-transform active:scale-95 inline-flex items-center gap-1.5 ${tone}`}
    >
      {/* The "urgent" chip's own dot, unchanged from the prototype — words carry the
          meaning (SC 1.4.1); the dot is decorative reinforcement, not the only signal. */}
      {filterKey === 'urgent' ? (
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--danger)]" aria-hidden="true" />
      ) : null}
      {/* The count is its own leaf, in `font-mono` — every OTHER numeral this screen
          renders is embedded inside a full, already-localized sentence (`plural()`'s
          templates, e.g. "3 היעדרויות רצופות"), and isolating a digit out of one of those
          would mean re-splitting a translation this app's `t()`/`plural()` has no hook
          for — see `TaskCardView`'s own note by `MoneyDisplay` for the same call made
          there. A bare count beside a filter's own name has no such sentence to split. */}
      <span>
        {text} <span className="font-mono">{count}</span>
      </span>
    </button>
  )
}

export function TasksScreen({
  locale,
  scheduleClient,
  peopleClient,
  commsClient,
  promiseClient,
  tasksClient,
  viewerPersonId,
  viewerIsManager,
  today,
}: {
  locale: Locale
  scheduleClient: StaffScheduleClient
  peopleClient: StaffPeopleClient
  commsClient: StaffCommsClient
  promiseClient?: PromiseClient
  tasksClient?: TasksClient
  viewerPersonId: string | null
  viewerIsManager: boolean
  today: string
}) {
  const { tasks } = useOpenTasks({
    enabled: true,
    locale,
    scheduleClient,
    peopleClient,
    commsClient,
    promiseClient,
    tasksClient,
    viewerPersonId,
    viewerIsManager,
    today,
  })
  const { rows: birthdayRows, isGreeted, toggle, resolveFamilies } = useBirthdays({
    enabled: true,
    locale,
    peopleClient,
    viewerPersonId,
    today,
  })
  const [filter, setFilter] = useState<'all' | TaskBucket>('all')

  const openCount = openTaskCount(tasks)
  const urgentCount = tasks.filter((task) => task.bucket === 'urgent').length
  const followUpCount = openCount - urgentCount
  const countFor = (key: 'all' | TaskBucket) =>
    key === 'all' ? openCount : key === 'urgent' ? urgentCount : followUpCount
  const visible = filter === 'all' ? tasks : tasks.filter((task) => task.bucket === filter)

  return (
    <section aria-labelledby="tasks-title" data-testid="staff-tasks" className="flex flex-col gap-4 px-4 pt-4 pb-8">
      <header>
        <div className="flex items-center gap-2">
          <span className="bg-[var(--danger)] text-[var(--on-status)] text-xs font-bold px-2.5 py-0.5 rounded-full shadow-xs font-mono">
            {openCount}
          </span>
          <h1 id="tasks-title" className="text-2xl font-black text-[var(--fg)] tracking-tight m-0">
            {t(locale, 'tasks.title')}
          </h1>
        </div>
        <p style={noteStyle} className="text-xs mt-1.5 leading-relaxed m-0" data-testid="tasks-open-count">
          {plural(locale, 'tasks.openCount', openCount)}
        </p>
      </header>

      <div
        role="group"
        aria-label={t(locale, 'tasks.filter.groupLabel')}
        className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1"
      >
        {FILTERS.map(({ key, labelKey }) => (
          <FilterChip
            key={key}
            filterKey={key}
            selected={filter === key}
            onSelect={() => setFilter(key)}
            testId={`tasks-filter-${key}`}
            text={t(locale, labelKey)}
            count={countFor(key)}
          />
        ))}
      </div>

      <BirthdaySection
        rows={birthdayRows}
        locale={locale}
        isGreeted={isGreeted}
        toggle={toggle}
        resolveFamilies={resolveFamilies}
      />

      {visible.length === 0 ? (
        <EmptyState
          title={t(locale, 'tasks.empty')}
          description={t(locale, 'tasks.emptyHint')}
        />
      ) : (
        <ul className="list-none m-0 p-0 flex flex-col gap-3.5">
          {visible.map((task) => (
            <li key={task.id} data-testid={`task-${task.id}`}>
              <TaskCardView task={task} locale={locale} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
