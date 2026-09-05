// The digital athlete card, opened from step 4's trainee rows.
//
// **The ת.ז. is not on it.** The prototype prints the minor's full national id
// (`AthleteCardModal.tsx:77`) and builds the card number from its last four digits
// (`GLD-2024-{idNumber.slice(-4)}`) -- on a card designed to be shown at tournaments.
// `Person.national_id_encrypted` is encrypted at rest precisely so it is not displayed
// casually, and this repo has already shipped an internal identifier as a user-facing
// answer once. The card number here comes from the REGISTRATION reference, which is a
// reference and not an identity document.
import { Award, IdCard, ShieldCheck, X } from 'lucide-react'
import { useDialog } from './useDialog'
import { ATHLETE_CARD_COPY, BELT_OPTIONS } from './content'
import { needsManagerReview } from './types'
import type { StudentDraft, WizardGroup } from './types'

const beltLabel = (id: string) => BELT_OPTIONS.find((option) => option.value === id)?.label ?? ''

export function AthleteCardModal({
  student,
  groups,
  registrationRef,
  onClose,
}: {
  student: StudentDraft
  groups: readonly WizardGroup[]
  registrationRef?: string
  onClose: () => void
}) {
  const copy = ATHLETE_CARD_COPY
  const dialogRef = useDialog(true, onClose)
  const name = `${student.firstName} ${student.lastName}`.trim()
  const initials = [student.firstName, student.lastName]
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
  const group = groups.find((entry) => entry.id === student.groupId)
  const awaiting = needsManagerReview(student)

  return (
    <div
      className="tw-scope fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`${copy.title}: ${name}`}
        tabIndex={-1}
        className="w-full max-w-[420px] bg-gradient-to-b from-[#0e2766] to-[#02102f] rounded-t-3xl sm:rounded-2xl shadow-2xl border border-white/10 overflow-hidden focus:outline-none"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2 text-white">
            <IdCard className="w-5 h-5 text-[#ffd700]" />
            <span className="text-[14px] font-bold">{copy.title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-[#001849] text-[#ffd700] font-bold flex items-center justify-center text-[20px] border border-white/15 shrink-0">
              {initials || '🥋'}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[19px] font-bold text-white truncate">{name}</span>
              <span className="text-[12px] text-[#b3c5ff] truncate">{group?.name ?? ''}</span>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-2 text-[12px]">
            {[
              { label: copy.belt, value: beltLabel(student.beltId), Icon: Award },
              { label: copy.season, value: 'תשפ״ה', Icon: ShieldCheck },
            ].map(({ label, value, Icon }) =>
              value ? (
                <div
                  key={label}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 flex flex-col gap-0.5"
                >
                  <dt className="text-[#8ea8f7] flex items-center gap-1">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </dt>
                  <dd className="text-white font-semibold truncate">{value}</dd>
                </div>
              ) : null,
            )}
          </dl>

          <div
            className={`rounded-xl px-3 py-2 text-[12px] font-bold flex items-center justify-between ${
              awaiting
                ? 'bg-amber-500/20 text-amber-200 border border-amber-400/40'
                : 'bg-[#10b981]/20 text-[#34d399] border border-[#10b981]/30'
            }`}
          >
            <span>{copy.status}</span>
            <span>{awaiting ? copy.awaiting : copy.active}</span>
          </div>

          {/* A reference, not an identity document. */}
          {registrationRef ? (
            <div className="border-t border-white/10 pt-3 text-center">
              <span className="text-[10px] font-mono tracking-widest text-[#8ea8f7]">
                {registrationRef}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
