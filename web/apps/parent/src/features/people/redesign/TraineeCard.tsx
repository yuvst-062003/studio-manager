// כרטיס חניך — the trainee card, redesigned. Replaces `StudentCard.tsx`, which is deleted
// in this same commit rather than left beside it (spec §11).
//
// **THE SLOT REGISTRY SURVIVES, and that is the point.** This screen is composed of
// sections owned by six different milestones — this lane's details and enrollments, M4's
// documents, M5's attendance, M6's payment, M7's belt. The container renders
// `useSlot('student-card')` and knows none of them by name, so a later lane adds one file
// plus one line in its own feature barrel and never reopens this one. What changed is the
// FRAME the slots render into, not the composition.
//
// `StudentCardSectionProps` moved here with the container. Five files import that type —
// `register.ts`, the three `sections/*.tsx`, and the feature barrel — and every registered
// section is typed by it, so it moves rather than being duplicated at the new path: a
// missed importer is then a compile error instead of a second definition nothing keeps in
// step.
//
// ── What the redesign fixed ───────────────────────────────────────────────────────────
//
// A5 — the old card was `article.studio-student-card`, styled from the previous design
// system, while every screen around it (home, profile, payments, shop, updates) is the
// current one. It read as a different application, and its rows render only when their
// data exists, so a real student with no belt and nothing marked collapsed to five rows on
// a two-thirds empty screen.
//
// A6 — nothing on it identified the child but their name. The header below carries an
// avatar, the belt and the groups, so the card is recognisably ABOUT somebody before the
// ledger starts.
//
// A1 — it had no way back at all. `ScreenHeader` is that, and it is shared rather than
// local: seven screens had the same defect.
import { useSlot } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { ScreenHeader } from '../../shell/ScreenHeader'
import type { EnrollmentOut, GuardianOut, StudentSummary } from '../peopleClient'

/**
 * What every `student-card` section receives.
 *
 * Sections read fields the wave's contract commit already put in the payload — they never
 * ask the container to fetch for them, which is what keeps a section from needing the
 * container to know it exists.
 */
export type StudentCardSectionProps = {
  student: StudentSummary
  locale: Locale
  enrollments?: EnrollmentOut[]
  guardians?: GuardianOut[]
}

/** The card's frames. Named for what they hold, so a lane can pick one without reading
 *  this file: a small identifying mark, the child's current standing, or a ledger row. */
type Region = 'mark' | 'status' | 'body'

/** The child's initial, on the club navy — the same treatment `ProfileHeader` gives the
 *  family. Deliberately NOT a photo: there is no student photo anywhere in this product,
 *  and inventing an upload on a summary card is a feature nobody asked for. */
function Avatar({ name, colorHex }: { name: string; colorHex?: string | null }) {
  return (
    <span
      aria-hidden="true"
      data-testid="trainee-avatar"
      className="w-14 h-14 rounded-2xl flex items-center justify-center font-bold text-xl text-white shadow-sm shrink-0"
      // The belt's colour when the child has one, the club navy when they do not. A belt
      // is the thing a child at a judo club is identified by, and using it here is what
      // makes two siblings' cards tell themselves apart at a glance.
      style={{ backgroundColor: colorHex ?? '#001849' }}
    >
      {name.trim().charAt(0)}
    </span>
  )
}

export function TraineeCard({
  student,
  locale,
  enrollments = [],
  guardians = [],
}: StudentCardSectionProps) {
  const marks = useSlot<StudentCardSectionProps>('student-card', 'mark')
  const statuses = useSlot<StudentCardSectionProps>('student-card', 'status')
  const rows = useSlot<StudentCardSectionProps>('student-card', 'body')

  const paint = (
    region: readonly { key: string; render: React.ComponentType<StudentCardSectionProps> }[],
  ) =>
    region.map(({ key, render: Section }) => (
      <Section
        key={key}
        student={student}
        locale={locale}
        enrollments={enrollments}
        guardians={guardians}
      />
    ))

  const fullName = `${student.first_name} ${student.last_name}`
  // The belt and the groups on ONE line under the name. They were two separate ledger rows
  // on a card that only had five — collapsing them is what stops the ledger reading as a
  // list of things the club could not fill in.
  const facts = [
    student.current_belt_name ?? null,
    (student.group_names ?? []).join(' · ') || null,
  ].filter(Boolean)

  return (
    <div data-testid="student-card">
      <ScreenHeader locale={locale} title={t(locale, 'people.card.title')} testId="trainee-header" />

      <section aria-labelledby="student-card-title" className="px-4 pt-4 space-y-3">
        {/* The identity block. One heading on the screen, and it is the child. */}
        <div className="flex items-center gap-3" data-testid="student-card-header">
          <Avatar name={fullName} colorHex={student.current_belt_color_hex} />
          <div className="min-w-0 flex-1 text-start">
            <h1
              id="student-card-title"
              className="text-xl font-bold text-slate-900 dark:text-white leading-tight truncate"
            >
              <bdi>{fullName}</bdi>
            </h1>
            {facts.length > 0 ? (
              <p
                data-testid="student-card-facts"
                className="text-xs text-slate-500 dark:text-slate-400 truncate"
              >
                <bdi>{facts.join(' · ')}</bdi>
              </p>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {t(locale, 'people.card.noBelt')}
              </p>
            )}
          </div>
          {/* The `mark` and `status` regions. Lanes place themselves here by naming a
              region beside their `order` — the container still learns no section's name. */}
          <div className="flex flex-col items-end gap-1 shrink-0">
            {paint(statuses)}
            {paint(marks)}
          </div>
        </div>

        {/* The ledger. A fixed label column is what makes eight lanes' rows read as one
            record about one child rather than as eight screens stacked. */}
        <div
          data-testid="student-card-rows"
          className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-xs overflow-hidden divide-y divide-slate-100 dark:divide-slate-800 studio-card-ledger"
        >
          {paint(rows)}
        </div>
      </section>
    </div>
  )
}

export type { Region as StudentCardRegion }
