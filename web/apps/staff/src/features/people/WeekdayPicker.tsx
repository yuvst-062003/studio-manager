// C12's day checkboxes, shared by every enrolment form in this lane.
//
// "EVERY ENROLMENT FORM COLLECTS attends_weekdays — which of that group's weekly sessions
// the child actually comes to. Offer the group's scheduled weekdays as checkboxes, **all
// ticked by default** (NULL means 'all of them'). This is a manager decision, exactly like
// the group and the price."
//
// **All ticked submits NULL, not the full array.** A stored array freezes today's timetable
// into the row: §5.6 rewrites future sessions when a rule changes, and a child recorded as
// "Sunday and Wednesday" would silently stop matching the day the club moves to Monday.
// NULL survives a schedule change; "every session of this group" means the same thing before
// and after.
import { Checkbox } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'

export function WeekdayPicker({
  locale,
  trainingWeekdays,
  selected,
  onChange,
}: {
  locale: Locale
  /** The days the group actually trains, observed through the schedule seam (L5). */
  trainingWeekdays: number[]
  selected: number[]
  onChange: (next: number[]) => void
}) {
  if (trainingWeekdays.length === 0) {
    // An empty list is a real answer — the club has not built this group's timetable yet.
    return <p data-testid="weekday-no-schedule">{t(locale, 'people.weekdays.noSchedule')}</p>
  }

  return (
    <fieldset data-testid="weekday-picker">
      <legend>{t(locale, 'people.weekdays.title')}</legend>
      <p>{t(locale, 'people.weekdays.hint')}</p>
      {trainingWeekdays.map((day) => (
        <Checkbox
          key={day}
          label={t(locale, `people.weekdays.${day}`)}
          checked={selected.includes(day)}
          data-testid={`weekday-${day}`}
          onChange={(event) =>
            onChange(
              event.target.checked
                ? [...selected, day].sort((a, b) => a - b)
                : selected.filter((value) => value !== day),
            )
          }
        />
      ))}
    </fieldset>
  )
}

/**
 * What the form actually sends.
 *
 * `null` when every training day is ticked — C12's default and the common case. An explicit
 * array only when the manager narrowed it, because that is the only case where the array
 * means something the schedule cannot say for itself.
 */
export function attendsWeekdaysFor(
  selected: number[],
  trainingWeekdays: number[],
): number[] | null {
  if (trainingWeekdays.length === 0) return null
  const everyDay = trainingWeekdays.every((day) => selected.includes(day))
  return everyDay ? null : [...selected].sort((a, b) => a - b)
}
