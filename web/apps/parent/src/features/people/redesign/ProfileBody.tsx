// פרופיל — ported from ProfileScreen.tsx lines 470-816: the attendance summary, the past
// purchases summary, the trainee cards, the dojo-branch details and the quick links. Stops
// before the prototype's first modal — none of the three (attendance summary, past
// attendances, past purchases) exists here, so every trigger that opened one is dropped
// rather than wired to nothing.
//
// Everything the prototype hardcoded is a prop here (see types.ts's header for the reads
// behind each one), and everything the prototype said in words comes from content.ts. Three
// things the prototype had that this file has no data for at all, so they are not ported:
// the per-child national id (lives on the prototype's Student Card MODAL, past line 816, and
// this product never shows one on a summary), the dojo's two coach rows (ClubDetails carries
// only name/address/phone, no staff), and the "recorded orders" / "sessions in August" count
// lines (no endpoint gives this file a month-scoped count, and a number a component cannot
// justify from its own props is a number it should not print).
import { AlertCircle, Award, Building2, CalendarDays, ChevronLeft, FileText, MapPin, ShoppingBag, TrendingUp } from 'lucide-react'
import { PROFILE, fill } from './content'
import type { AttendanceSummary, ClubDetails, ProfileChild, PurchaseRow } from './types'

export function ProfileBody({
  childList,
  selectedChildId,
  onSelectChild,
  attendance,
  purchases,
  club,
  money,
  dateLabel,
}: {
  childList: readonly ProfileChild[]
  /** Which child the attendance card is showing. `null` before the list has loaded. */
  selectedChildId: string | null
  onSelectChild: (id: string) => void
  /** One entry per child, already computed. `null` while the read is in flight. */
  attendance: readonly AttendanceSummary[] | null
  /** Newest first, already filtered to shop orders. `null` while loading. */
  purchases: readonly PurchaseRow[] | null
  club: ClubDetails | null
  /** Integer agorot -> a formatted string. NEVER divide by 100 in this file. */
  money: (agorot: number) => string
  /** `YYYY-MM-DD` -> a formatted date. Studio zone, done by the caller. */
  dateLabel: (isoDate: string) => string
}) {
  const selectedSummary =
    attendance?.find((entry) => entry.studentId === selectedChildId) ?? null

  return (
    <div className="space-y-4">
      {/* ========================================================= */}
      {/* ATTENDANCE SUMMARY CARD */}
      {/* ========================================================= */}
      <section
        aria-labelledby="profile-attendance-heading"
        data-testid="profile-attendance"
        className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-100 dark:border-slate-800 shadow-xs space-y-3.5 text-start transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <TrendingUp className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h2 id="profile-attendance-heading" className="text-xs font-bold text-slate-900 dark:text-white">
              {PROFILE.attendanceTitle}
            </h2>
            <p className="text-[10px] text-slate-400">{PROFILE.attendanceSub}</p>
          </div>
        </div>

        {/* Trainee Selector Pills */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar"
          role="group"
          aria-label={PROFILE.traineesTitle}
        >
          {childList.map((child) => {
            const isSelected = child.id === selectedChildId
            return (
              <button
                key={child.id}
                type="button"
                data-testid={`profile-attendance-pill-${child.id}`}
                aria-pressed={isSelected}
                onClick={() => onSelectChild(child.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? 'bg-[#001849] dark:bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {child.beltColorHex !== null && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: child.beltColorHex }}
                  />
                )}
                <span>{child.firstName}</span>
              </button>
            )
          })}
        </div>

        {/* Visual Monthly Percentage Display */}
        {attendance === null || selectedChildId === null ? (
          <div className="bg-gradient-to-r from-blue-50/70 via-slate-50 to-emerald-50/60 dark:from-slate-800/80 dark:via-slate-800/60 dark:to-emerald-950/30 p-3.5 rounded-2xl border border-blue-100/60 dark:border-slate-700">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 text-center" role="status">
              {PROFILE.loading}
            </p>
          </div>
        ) : selectedSummary === null || selectedSummary.marked === 0 ? (
          <div className="bg-gradient-to-r from-blue-50/70 via-slate-50 to-emerald-50/60 dark:from-slate-800/80 dark:via-slate-800/60 dark:to-emerald-950/30 p-3.5 rounded-2xl border border-blue-100/60 dark:border-slate-700">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 text-center">
              {PROFILE.attendanceNone}
            </p>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-blue-50/70 via-slate-50 to-emerald-50/60 dark:from-slate-800/80 dark:via-slate-800/60 dark:to-emerald-950/30 p-3.5 rounded-2xl border border-blue-100/60 dark:border-slate-700 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {fill(PROFILE.attendanceCount, {
                  attended: selectedSummary.attended,
                  marked: selectedSummary.marked,
                })}
              </span>
              <div className="flex items-baseline gap-1 bg-white dark:bg-slate-900 px-3 py-1 rounded-xl border border-blue-100 dark:border-slate-700 shadow-xs">
                <span className="text-xl font-black text-[#001849] dark:text-blue-400">
                  {selectedSummary.percent}%
                </span>
              </div>
            </div>

            <div
              className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={selectedSummary.percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${selectedSummary.percent}%` }}
              />
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-500 dark:text-slate-400">{PROFILE.attendanceHint}</p>
      </section>

      {/* ========================================================= */}
      {/* PAST PURCHASES & ORDERS SUMMARY */}
      {/* ========================================================= */}
      <section
        aria-labelledby="profile-purchases-heading"
        data-testid="profile-purchases"
        className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-100 dark:border-slate-800 shadow-xs space-y-3 text-start transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-400 flex items-center justify-center">
            <ShoppingBag className="w-4 h-4" aria-hidden="true" />
          </div>
          <h2 id="profile-purchases-heading" className="text-xs font-bold text-slate-900 dark:text-white">
            {PROFILE.purchasesTitle}
          </h2>
        </div>

        {purchases === null ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-2" role="status">
            {PROFILE.loading}
          </p>
        ) : purchases.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-2">
            {PROFILE.purchasesEmpty}
          </p>
        ) : (
          <div className="space-y-2">
            {purchases.slice(0, 3).map((row) => (
              <div
                key={row.id}
                data-testid={`profile-purchase-${row.id}`}
                className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-100 dark:border-slate-800 space-y-1.5"
              >
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">
                  {row.label}
                </span>
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200/50 dark:border-slate-700/60">
                  <span>{dateLabel(row.dueDate)}</span>
                  <span className="font-black text-slate-900 dark:text-white">
                    {money(row.amountAgorot)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        <a
          href="#/payments/history"
          data-testid="profile-purchase-all"
          className="text-[11px] font-bold text-[#0056c5] dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          <span>{PROFILE.purchasesAll}</span>
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      </section>

      {/* Trainees Cards - each an <a> into the child's own card */}
      <section aria-labelledby="profile-trainees-heading" data-testid="profile-trainees" className="space-y-2.5 text-start">
        <div className="flex items-center justify-between">
          <h2 id="profile-trainees-heading" className="text-xs font-bold text-slate-800 dark:text-slate-200">
            {PROFILE.traineesTitle}
          </h2>
          <span className="text-[11px] text-slate-400">{PROFILE.traineesSub}</span>
        </div>

        <div className="space-y-2">
          {childList.map((child) => (
            <a
              key={child.id}
              href={`#/student/${child.id}`}
              data-testid={`profile-trainee-${child.id}`}
              className="w-full bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/70 active:scale-98 rounded-3xl p-3.5 border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-between gap-3 text-start transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-xs"
                  style={
                    child.beltColorHex !== null
                      ? { backgroundColor: `${child.beltColorHex}20` }
                      : undefined
                  }
                >
                  <Award
                    className="w-6 h-6"
                    style={child.beltColorHex !== null ? { color: child.beltColorHex } : undefined}
                    aria-hidden="true"
                  />
                </div>
                <div className="space-y-0.5 min-w-0 text-start">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-sm text-slate-900 dark:text-white group-hover:text-[#0056c5] dark:group-hover:text-blue-400 transition-colors truncate">
                      {child.displayName}
                    </h3>
                    {child.beltColorHex !== null ? (
                      <span
                        className="text-[10px] font-bold px-2 py-0.2 rounded-full text-white shrink-0"
                        style={{ backgroundColor: child.beltColorHex }}
                      >
                        {child.beltName ?? PROFILE.beltUnset}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0">
                        {child.beltName ?? PROFILE.beltUnset}
                      </span>
                    )}
                  </div>
                  {child.attendancePercent !== null && (
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                      <span>
                        {PROFILE.attendanceLabel}: {child.attendancePercent}%
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {child.needsDeclaration && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-[#ba1a1a] dark:text-red-400 font-bold bg-red-50 dark:bg-red-950/50 px-2.5 py-1 rounded-xl border border-red-100 dark:border-red-900">
                    <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{PROFILE.needsDeclaration}</span>
                  </span>
                )}
                <ChevronLeft
                  className="w-4 h-4 text-slate-400 group-hover:text-[#0056c5] dark:group-hover:text-blue-400 transition-all"
                  aria-hidden="true"
                />
              </div>
            </a>
          ))}

          <a
            href="#/add-child"
            data-testid="profile-add-child"
            className="w-full bg-white dark:bg-slate-900 hover:bg-slate-50/80 dark:hover:bg-slate-800/70 active:scale-98 rounded-3xl p-3.5 border border-slate-100 dark:border-slate-800 shadow-xs flex items-center justify-center gap-2 text-xs font-bold text-[#0056c5] dark:text-blue-400 transition-all cursor-pointer"
          >
            <span>{PROFILE.addChild}</span>
          </a>
        </div>
      </section>

      {/* Dojo Branch Details */}
      <section
        aria-labelledby="profile-dojo-heading"
        data-testid="profile-dojo"
        className="bg-white dark:bg-slate-900 rounded-3xl p-4 border border-slate-100 dark:border-slate-800 shadow-xs space-y-2.5 text-start transition-colors"
      >
        <div className="flex items-center gap-2 text-slate-900 dark:text-white font-bold text-xs">
          <Building2 className="w-4 h-4 text-[#0056c5] dark:text-blue-400" aria-hidden="true" />
          <h2 id="profile-dojo-heading" className="text-xs font-bold text-slate-900 dark:text-white">
            {PROFILE.dojoTitle}
          </h2>
        </div>
        <div className="space-y-2 text-xs text-slate-600 dark:text-slate-300">
          {club === null ? (
            <p role="status">{PROFILE.loading}</p>
          ) : (
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              <span>{club.address ?? PROFILE.dojoNoAddress}</span>
            </div>
          )}
        </div>
        <a
          href="#/directions"
          data-testid="profile-directions"
          className="text-[11px] font-bold text-[#0056c5] dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          <span>{PROFILE.directions}</span>
          <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
        </a>
      </section>

      {/* Quick Links & Regulations */}
      <section aria-labelledby="profile-links-heading" data-testid="profile-links">
        <h2 id="profile-links-heading" className="sr-only">
          {PROFILE.linksTitle}
        </h2>
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-3.5 border border-slate-100 dark:border-slate-800 shadow-xs divide-y divide-slate-100 dark:divide-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 transition-colors">
          <a
            href="#/privacy"
            className="w-full py-2.5 flex items-center justify-between hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <span>{PROFILE.privacy}</span>
            <FileText className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </a>
          <a
            href="#/calendar"
            data-testid="link-calendar"
            className="w-full py-2.5 flex items-center justify-between hover:text-slate-900 dark:hover:text-white cursor-pointer"
          >
            <span>{PROFILE.calendarFeed}</span>
            <CalendarDays className="w-4 h-4 text-slate-400" aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  )
}
