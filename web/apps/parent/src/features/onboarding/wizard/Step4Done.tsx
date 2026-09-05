// §7 -- the done screen. Full-bleed dark, no wizard header above it.
//
// Four things the prototype does that are not ported (§14, §16 item 5):
//   * the registration code is hardcoded `GLD-2024-8841`. Here it is a PROP, and the card
//     does not render at all without one -- a fabricated confirmation number is worse than
//     no confirmation number.
//   * the primary button opens a modal for `trainees[0]` while reading
//     "מעבר לאזור האישי באפליקציה". It enters the app.
//   * a "חזרה לתחילת תהליך הרישום" link resets the whole wizard. A family that has just
//     registered has nothing to restart, and pressing it after a real submit would be
//     alarming.
//   * confetti fires unconditionally through `canvas-confetti`. That is a new UI
//     dependency, which `.claude/rules/ui-rtl-a11y.md` says not to add without asking, so
//     the celebration is CSS -- and it respects `prefers-reduced-motion`.
import { useEffect, useState } from 'react'
import { Check, Clock, Copy, MessageCircle } from 'lucide-react'
import { AthleteCardModal } from './AthleteCardModal'
import { STEP4_COPY, UPCOMING_EVENTS } from './content'
import { needsManagerReview } from './types'
import type { StudentDraft, WizardGroup } from './types'

function Confetti() {
  //: No dependency, and silent for anyone who has asked for less motion. The preference is
  //: read at INITIALISATION rather than set from an effect -- setting state synchronously
  //: in an effect triggers a second render before the browser has painted the first.
  const [run, setRun] = useState(
    () => !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    if (!run) return
    const timer = setTimeout(() => setRun(false), 3200)
    return () => clearTimeout(timer)
  }, [run])
  if (!run) return null

  const colours = ['#ffd700', '#0056c5', '#34d399', '#ffffff', '#b3c5ff']
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-64 overflow-hidden">
      {Array.from({ length: 28 }, (_, index) => (
        <span
          key={index}
          className="absolute block w-1.5 h-2.5 rounded-[1px] animate-[wizard-fall_2.8s_linear_forwards]"
          style={{
            insetInlineStart: `${(index * 37) % 100}%`,
            background: colours[index % colours.length],
            animationDelay: `${(index % 9) * 0.12}s`,
          }}
        />
      ))}
    </div>
  )
}

export type Step4DoneProps = {
  students: readonly StudentDraft[]
  groups: readonly WizardGroup[]
  /** The reference the submit returned. Absent means the card is not drawn. */
  registrationRef?: string
  clubLogoUrl?: string | null
  whatsappUrl?: string | null
  onEnterApp: () => void
}

export function Step4Done({
  students,
  groups,
  registrationRef,
  clubLogoUrl,
  whatsappUrl,
  onEnterApp,
}: Step4DoneProps) {
  const copy = STEP4_COPY
  const [copied, setCopied] = useState(false)
  const [card, setCard] = useState<StudentDraft | null>(null)
  const anyAwaiting = students.some(needsManagerReview)

  const copyRef = async () => {
    if (!registrationRef) return
    try {
      await navigator.clipboard.writeText(registrationRef)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      //: The prototype flips to the success check regardless of the outcome. Clipboard
      //: access is refused in plenty of ordinary situations; saying "copied" when nothing
      //: was is worse than saying nothing.
      setCopied(false)
    }
  }

  return (
    <div className="tw-scope relative w-full min-h-screen bg-[#02102f] text-white px-4 pt-6 pb-20">
      <style>{'@keyframes wizard-fall{to{transform:translateY(16rem) rotate(320deg);opacity:0}}'}</style>
      <Confetti />

      <div className="relative max-w-[480px] mx-auto flex flex-col items-center">
        <div className="w-full flex items-center justify-between gap-2 mb-6">
          <span className="px-3 py-1 rounded-full bg-white/10 text-[#dae1ff] text-[12px] font-semibold border border-white/15 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-[#10b981]" />
            <span>{copy.stageBadge}</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-[#0056c5] text-white text-[12px] font-bold shadow-sm whitespace-nowrap">
            {copy.percentBadge}
          </span>
        </div>

        <div className="relative mb-5 flex flex-col items-center">
          {clubLogoUrl ? (
            <img
              src={clubLogoUrl}
              alt=""
              className="w-36 h-36 sm:w-40 sm:h-40 object-contain drop-shadow-[0_4px_24px_rgba(255,255,255,0.12)]"
            />
          ) : null}
          <span className="mt-3 px-4 py-1.5 rounded-full bg-[#001849] border border-[#0056c5] text-[#dae1ff] text-[13px] font-bold flex items-center gap-2 shadow-md">
            <span aria-hidden>🥋</span>
            <span>{copy.ippon}</span>
          </span>
        </div>

        <div className="text-center space-y-2 mb-6">
          <h2 className="text-[26px] sm:text-[30px] font-black tracking-tight leading-tight text-white">
            {copy.title}
            <br />
            {copy.titleSecond}
          </h2>
          <p className="text-[13px] text-[#b3c5ff] leading-relaxed max-w-sm mx-auto">
            {anyAwaiting ? copy.leadWithReview : copy.leadPlain}
          </p>
        </div>

        {anyAwaiting ? (
          <div className="w-full bg-amber-500/20 border border-amber-400/40 rounded-2xl p-4 mb-5 text-amber-200 flex items-start gap-3 shadow-md">
            <Clock className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1 text-[12.5px] leading-relaxed text-right">
              <span className="font-bold text-white text-[13px]">{copy.reviewNoticeTitle}</span>
              <span>{copy.reviewNoticeBody}</span>
            </div>
          </div>
        ) : null}

        {registrationRef ? (
          <div className="w-full bg-[#0d2157]/80 backdrop-blur-md rounded-2xl p-4 border border-[#2a4484] shadow-lg flex flex-col items-center gap-1.5 mb-5">
            <span className="text-[11px] text-[#b3c5ff] font-medium">{copy.refLabel}</span>
            <div className="flex items-center gap-3">
              <span className="text-[22px] font-black tracking-wider text-[#ffd700] font-mono">
                {registrationRef}
              </span>
              <button
                type="button"
                onClick={copyRef}
                aria-label={copy.copyRef}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-400" />
                ) : (
                  <Copy className="w-4 h-4 text-[#dae1ff]" />
                )}
              </button>
            </div>
          </div>
        ) : null}

        <div className="w-full bg-[#091b48]/90 rounded-2xl p-4 border border-[#1b3a8a] shadow-md mb-5 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-white/10">
            <span className="text-[14px] font-bold text-white flex items-center gap-1.5">
              <span aria-hidden>👥</span>
              <span>
                {copy.traineesTitle} ({students.length})
              </span>
            </span>
            <span className="text-[11px] text-[#b3c5ff] font-medium">{copy.season}</span>
          </div>

          <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
            {students.map((student) => {
              const name = `${student.firstName} ${student.lastName}`.trim()
              const initials = [student.firstName, student.lastName]
                .filter(Boolean)
                .map((part) => part[0])
                .join('')
              const awaiting = needsManagerReview(student)
              //: The group's real name. The prototype guesses from `groupKey === 'group4'`,
              //: which labels groups 1, 2, 3 and 5 all as "צעירי גלדיאטור".
              const group = groups.find((entry) => entry.id === student.groupId)
              return (
                <li key={student.id}>
                  <button
                    type="button"
                    onClick={() => setCard(student)}
                    aria-label={`${copy.openCard}: ${name}`}
                    className="w-full flex items-center justify-between gap-2 p-3 rounded-xl bg-[#0e2766] border border-white/10 hover:border-[#0056c5] transition-all cursor-pointer text-right"
                  >
                    <span className="flex items-center gap-3 min-w-0">
                      <span className="w-10 h-10 rounded-lg bg-[#001849] text-[#ffd700] font-bold flex items-center justify-center text-xs shrink-0 border border-white/15">
                        {initials || '🥋'}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="text-[14px] font-bold text-white truncate">{name}</span>
                        <span className="text-[11px] text-[#8ea8f7] truncate">
                          {group?.name ?? ''}
                        </span>
                      </span>
                    </span>
                    {awaiting ? (
                      <span className="px-2.5 py-1 rounded-full bg-amber-500/25 text-amber-300 text-[11px] font-bold flex items-center gap-1 border border-amber-400/40 shrink-0">
                        <Clock className="w-3.5 h-3.5" />
                        {copy.awaitingBadge}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full bg-[#10b981]/20 text-[#34d399] text-[11px] font-bold flex items-center gap-1 border border-[#10b981]/30 shrink-0">
                        <Check className="w-3 h-3" />
                        {copy.paidBadge}
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <div className="w-full bg-[#091b48]/90 rounded-2xl p-4 border border-[#1b3a8a] shadow-md mb-5 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs pb-1 border-b border-white/10">
            <span className="text-[14px] font-bold text-white flex items-center gap-1.5">
              <span aria-hidden>📅</span>
              <span>{copy.eventsTitle}</span>
            </span>
          </div>
          <ul className="flex flex-col gap-2.5 list-none p-0 m-0">
            {UPCOMING_EVENTS.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#0e2766] border border-white/10"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-11 h-11 rounded-xl bg-[#0056c5] flex flex-col items-center justify-center text-white shrink-0">
                    <span className="text-[15px] font-bold leading-none">{event.day}</span>
                    <span className="text-[10px] opacity-80 leading-none mt-0.5">{event.month}</span>
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-[13px] font-bold text-white truncate">{event.title}</span>
                    <span className="text-[11px] text-[#b3c5ff] truncate">{event.detail}</span>
                  </span>
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/10 text-white text-[11px] font-medium shrink-0">
                  {event.audience}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {whatsappUrl ? (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full bg-[#032338] hover:bg-[#04334f] border border-[#059669]/50 rounded-2xl p-3.5 shadow-md flex items-center justify-between gap-3 mb-6 transition-all group"
          >
            <span className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-full bg-[#10b981] text-white flex items-center justify-center shrink-0 shadow-sm">
                <MessageCircle className="w-5 h-5" />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-[14px] font-bold text-white">{copy.whatsappTitle}</span>
                <span className="text-[11px] text-[#6ee7b7] truncate">{copy.whatsappLead}</span>
              </span>
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-[#10b981] text-white text-[12px] font-bold shrink-0 group-hover:scale-105 transition-transform">
              {copy.whatsappJoin}
            </span>
          </a>
        ) : null}

        <button
          type="button"
          onClick={onEnterApp}
          className="w-full h-13 py-3.5 rounded-2xl bg-[#0056c5] hover:bg-[#00429b] active:scale-[0.99] text-white font-bold text-[16px] shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          {copy.enterApp}
        </button>
      </div>

      {card ? (
        <AthleteCardModal
          student={card}
          groups={groups}
          registrationRef={registrationRef}
          onClose={() => setCard(null)}
        />
      ) : null}
    </div>
  )
}
