// פרופיל, as a card of button-rows.
//
// Owner review, 2026-09-06: "showing button on each one, without the data itself, and when
// pressing it opens a popup — like a card of buttons, so the screen isn't full and stacked."
// The screen before this one laid all nine sections out end to end and ran to four thousand
// pixels.
//
// WHAT IS NOT HERE ANY MORE, and where it went instead:
//
//   נוכחות     — deleted as a section. It is a PER-CHILD number, and putting it on a family
//                screen is what forced a child picker onto a screen about nobody in
//                particular. The percentage now sits on the child's own row inside
//                המתאמנים שלי, and the full record is in the child's card, where it already
//                was. Nothing on Home: those chips are a FILTER — one already carries a
//                count of children — and a second number meaning something else on the same
//                row is the confusion the updates counter had to be fixed for.
//   רכישות     — moved to חנות המועדון. They are shop orders, and the prototype's own
//                GearScreen puts an order tracker at the top of the shop.
//   הדוג׳ו     — merged into המועדון with the contact actions. Both answer "how do I reach
//                the club".
//
// A ROW CARRIES ITS TITLE AND NOTHING ELSE, except a red dot when something needs
// attention. "Without the data itself" was the instruction, so there are no amounts and no
// percentages here — but a completely silent row would hide an unpaid balance behind a
// popup, and a dot is a mark rather than a number.
import type { LucideIcon } from 'lucide-react'
import { Building2, ChevronLeft, CreditCard, Settings, User, Users } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export type MenuKey = 'personal' | 'trainees' | 'payments' | 'club'

/** Built per render rather than once at module load: the labels are translated, and a
 *  module-level constant would freeze whichever language happened to load first. */
function rowsFor(locale: Locale): { key: MenuKey; label: string; icon: LucideIcon }[] {
  return [
    { key: 'personal', label: t(locale, 'people.profile.menuPersonal'), icon: User },
    { key: 'trainees', label: t(locale, 'people.profile.menuTrainees'), icon: Users },
    { key: 'payments', label: t(locale, 'people.profile.menuPayments'), icon: CreditCard },
    { key: 'club', label: t(locale, 'people.profile.menuClub'), icon: Building2 },
  ]
}

export function ProfileMenu({
  locale,
  onOpen,
  onOpenSettings,
  attention,
}: {
  locale: Locale
  onOpen: (key: MenuKey) => void
  onOpenSettings: () => void
  /** Which rows need the parent to do something. */
  attention: Readonly<Partial<Record<MenuKey, boolean>>>
}) {
  return (
    <div className="px-4 space-y-3">
      <div
        data-testid="profile-menu"
        className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs overflow-hidden divide-y divide-slate-100 dark:divide-slate-800"
      >
        {rowsFor(locale).map(({ key, label, icon: Icon }) => (
          <Row
            key={key}
            icon={Icon}
            label={label}
            testId={`profile-row-${key}`}
            needsAttention={attention[key] === true}
            attentionLabel={t(locale, 'people.profile.needsAttention')}
            onClick={() => onOpen(key)}
          />
        ))}
      </div>

      {/* A card of its own. "What I have" and "my account" are different questions, and a
          sign-out sitting one row under a child's name is a sign-out somebody taps by
          accident. */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs overflow-hidden">
        <Row
          icon={Settings}
          label={t(locale, 'people.profile.menuSettings')}
          testId="profile-row-settings"
          needsAttention={false}
          attentionLabel={t(locale, 'people.profile.needsAttention')}
          onClick={onOpenSettings}
        />
      </div>
    </div>
  )
}

function Row({
  icon: Icon,
  label,
  testId,
  needsAttention,
  attentionLabel,
  onClick,
}: {
  icon: LucideIcon
  label: string
  testId: string
  needsAttention: boolean
  attentionLabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      // The dot is a colour, so it cannot be the only carrier of "this needs you" — the
      // accessible name says it too. SC 1.4.1.
      aria-label={needsAttention ? `${label} · ${attentionLabel}` : undefined}
      className="w-full flex items-center gap-3 px-4 py-4 text-start hover:bg-slate-50 dark:hover:bg-slate-800/60 active:scale-[0.99] transition-all cursor-pointer"
    >
      <span className="w-9 h-9 rounded-2xl bg-blue-50 dark:bg-blue-400/15 text-[#0056c5] dark:text-blue-300 flex items-center justify-center shrink-0">
        <Icon className="w-4.5 h-4.5" aria-hidden="true" />
      </span>
      <span className="flex-1 text-sm font-semibold text-slate-900 dark:text-slate-50 min-w-0 truncate">
        {label}
      </span>
      {needsAttention ? (
        <span
          aria-hidden="true"
          data-testid={`${testId}-dot`}
          className="w-2 h-2 rounded-full bg-[#e02424] shrink-0"
        />
      ) : null}
      {/* ChevronLeft, not Right: in a right-to-left document "onward" points left, which is
          the direction every other disclosure arrow in this app already goes. */}
      <ChevronLeft className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true" />
    </button>
  )
}
