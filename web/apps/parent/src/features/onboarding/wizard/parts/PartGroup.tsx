// §5.3 -- part 2. WHICH AGE BAND the child trains with. How often they train is part 3's
// question, and the two are independent.
//
// One base group per child. All five are the same shape -- two sessions a week, Tuesday and
// Friday -- and `training_plan.py` says base training is included in every plan.
//
// A real radio group, not the prototype's `<div onClick>`: those are unreachable by
// keyboard and announce as nothing (§14.3).
import { Calendar, Check, CheckCircle2, Swords } from 'lucide-react'
import { STUDENT_FORM_COPY } from '../content'
import type { WizardGroup } from '../types'

export function PartGroup({
  groups,
  selectedId,
  onSelect,
  error,
}: {
  groups: readonly WizardGroup[]
  selectedId: string
  onSelect: (id: string) => void
  error: string | null
}) {
  const copy = STUDENT_FORM_COPY
  const selected = groups.find((group) => group.id === selectedId)

  return (
    <fieldset className="flex flex-col gap-3.5 border-0 p-0 m-0">
      <legend className="contents">
        <div className="flex items-center gap-2 pb-1 pt-0.5">
          <div className="w-8 h-8 rounded-lg bg-[#dae1ff] flex items-center justify-center text-[#001849] shrink-0">
            <Swords className="w-4 h-4" />
          </div>
          <div className="text-right">
            <h4 className="text-[17px] text-[#001849] font-bold leading-tight">{copy.groupTitle}</h4>
            <p className="text-[12px] text-[#444650]">{copy.groupLead}</p>
          </div>
        </div>
      </legend>

      <div className="flex flex-col gap-2.5">
        {groups.map((group) => {
          const isSelected = selectedId === group.id
          return (
            <label
              key={group.id}
              className={`group relative flex items-start gap-3 p-3.5 rounded-xl cursor-pointer transition-all duration-200 shadow-2xs has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
                isSelected
                  ? 'bg-white border-2 border-[#0056c5] shadow-md'
                  : 'bg-white border border-[#c5c6d2]/50 hover:border-[#0056c5]'
              }`}
            >
              <input
                type="radio"
                name="wizard-group"
                value={group.id}
                checked={isSelected}
                onChange={() => onSelect(group.id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                  isSelected
                    ? 'border-[#0056c5] bg-[#0056c5] text-white'
                    : 'border-[#757681] text-transparent bg-transparent'
                }`}
              >
                <Check className="w-3.5 h-3.5 stroke-[3]" />
              </span>

              <span className="flex flex-col min-w-0 flex-1">
                <span className="flex items-center justify-between flex-wrap gap-1">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-bold text-[#161b28]">{group.name}</span>
                    <span className="px-2 py-0.5 rounded-md bg-[#e9edff] text-[#0056c5] text-[11px] font-semibold">
                      {group.trackLabel}
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-[#dae1ff] text-[#001849] text-[11px] font-semibold">
                      {group.durationMin} {copy.minutesPerSession}
                    </span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-[#d9e2ff] text-[#001945] text-[11px] font-bold flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {group.scheduleLabel}
                  </span>
                </span>
                <span className="flex items-center gap-2 mt-2 text-[#444650] text-[12px] flex-wrap">
                  <span>
                    {copy.coaches}: {group.coachesLabel}
                  </span>
                  <span aria-hidden>•</span>
                  <span>{group.locationLabel}</span>
                </span>
              </span>
            </label>
          )
        })}
      </div>

      {error ? (
        <p className="text-[12px] text-red-600 font-medium" role="alert">
          {error}
        </p>
      ) : null}

      {selected ? (
        <div className="p-3 rounded-xl bg-[#e9edff] border border-[#dee2f4] flex items-center gap-2 text-[#001849] text-[13px] shadow-2xs">
          <CheckCircle2 className="w-5 h-5 text-[#0056c5] shrink-0" />
          <span className="font-semibold">{copy.groupSelected}</span>
          <span className="px-2.5 py-0.5 rounded-lg bg-white text-[#001849] text-[13px] font-bold shadow-2xs">
            {selected.name}
          </span>
        </div>
      ) : null}
    </fieldset>
  )
}
