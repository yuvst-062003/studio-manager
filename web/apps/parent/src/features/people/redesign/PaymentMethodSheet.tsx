// אמצעי תשלום — the picker, and where הוראת קבע and צ׳קים actually live.
//
// **The owner's report, 2026-09-08:** *"the cheques and the הוראת קבע are misplaced. It
// should be that if you press אמצעי תשלום they show, and I'll be able to switch between
// them."* They were right about both halves. אמצעי תשלום was an inert label — a row that
// named the method and could not change it — and the two routes sat below it as
// always-open cards, shouting at every family whether or not they used either one.
//
// So the row became a button, and the cards became the DETAIL of whichever method is
// selected. A family that pays by card never sees a mandate link again.
//
// **One block per child**, because that is what the join wizard collects and what a
// mandate is: signed per child, at that child's own price, which is why
// `GET /me/standing-order-links` returns a list. A one-child family — the common case —
// gets a single block with no heading, which is the simple four-way picker that was asked
// for. A family with a child on הוראת קבע and a child on card can finally say so.
//
// **Choosing is not paying.** Saving writes a preference and moves no money. The two
// things here that DO commit a family — the mandate link, the cheque request — are
// deliberate presses inside the method they belong to.
import { useState } from 'react'
import { Banknote, CreditCard, FileText, Repeat } from 'lucide-react'
import { fill } from '@studio/core'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Sheet } from './Sheet'
import type { ChequeRoute, MandateLinkRow } from './sheets'

/** `payment.method`'s vocabulary — the same four the column holds and `methodKey`
 *  translates. Ordered as a family meets them: the two that settle now, then the two that
 *  are arranged once. */
export const METHOD_KEYS = ['upay_card', 'cash', 'standing_order', 'cheque'] as const
export type MethodKey = (typeof METHOD_KEYS)[number]

const ICONS = {
  upay_card: CreditCard,
  cash: Banknote,
  standing_order: Repeat,
  cheque: FileText,
} as const

/** An i18n key suffix under `billing.method.`. `upay_card` is spelled `card` there, which
 *  is `methodKey`'s own mapping rather than a second one invented here. */
const LABEL_KEY: Record<MethodKey, string> = {
  upay_card: 'card',
  cash: 'cash',
  standing_order: 'standingOrder',
  cheque: 'cheque',
}

export type MethodRow = {
  studentId: string
  studentName: string
  /** `null` for a family that has never answered. Distinct from any method. */
  method: MethodKey | null
}

export function PaymentMethodSheet({
  rows,
  locale,
  mandateLinks,
  cheque,
  money,
  busy,
  error,
  onSave,
  onClose,
}: {
  rows: readonly MethodRow[]
  locale: Locale
  /** Every child's mandate link. Filtered BY ID to the child whose block shows it — one
   *  bare link would have a two-child family sign one mandate and underpay for the other
   *  every month, and matching on the displayed name would do the same to two siblings
   *  who share one. */
  mandateLinks: readonly MandateLinkRow[]
  /** The cheque route, or `null` while its own numbers are in flight. Family-level: a
   *  season of cheques is handed over once, for everybody. */
  cheque: ChequeRoute | null
  money: (agorot: number) => string
  busy: boolean
  error: string | null
  onSave: (items: readonly { studentId: string; method: MethodKey }[]) => void
  onClose: () => void
}) {
  /** The unsaved answer. A local draft rather than writing on every tap: a family with two
   *  children changing both would otherwise send two writes and see the first one's result
   *  flash past. */
  const [draft, setDraft] = useState<Record<string, MethodKey | null>>(() =>
    Object.fromEntries(rows.map((row) => [row.studentId, row.method])),
  )

  const chosen = (studentId: string) => draft[studentId] ?? null
  const anyOnCheques = rows.some((row) => chosen(row.studentId) === 'cheque')
  const chequeTotal = cheque ? cheque.openAgorot + cheque.months * cheque.monthlyTotalAgorot : 0
  const answered = rows
    .map((row) => ({ studentId: row.studentId, method: chosen(row.studentId) }))
    .filter((row): row is { studentId: string; method: MethodKey } => row.method !== null)

  return (
    <Sheet
      title={t(locale, 'people.profile.paymentMethod')}
      locale={locale}
      testId="sheet-method"
      onClose={onClose}
    >
      {rows.map((row) => {
        const selected = chosen(row.studentId)
        return (
          <section key={row.studentId} data-testid="method-child" className="text-start">
            {/* A one-child family needs no heading — the sheet's own title already says
                what this is, and a name above a single group is a level of structure that
                only earns its place when there are two of them. */}
            {rows.length > 1 ? (
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 mb-2">
                {row.studentName}
              </h3>
            ) : null}

            <fieldset className="border-0 p-0 m-0">
              <legend className="sr-only">
                {fill(t(locale, 'people.profile.paymentMethodFor'), { name: row.studentName })}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {METHOD_KEYS.map((key) => {
                  const Icon = ICONS[key]
                  const active = selected === key
                  return (
                    <label
                      key={key}
                      data-testid={`method-${row.studentId}-${key}`}
                      className={`cursor-pointer rounded-2xl py-3 flex flex-col items-center justify-center gap-1.5 transition-all has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[#0056c5] ${
                        active
                          ? 'bg-[#001849] text-white shadow-md'
                          : 'bg-slate-50 dark:bg-slate-800/70 text-slate-900 dark:text-slate-200 border border-slate-100 dark:border-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`method-${row.studentId}`}
                        checked={active}
                        onChange={() =>
                          setDraft((current) => ({ ...current, [row.studentId]: key }))
                        }
                        className="sr-only"
                      />
                      <Icon className="w-5 h-5" aria-hidden="true" />
                      <span className="text-[13px] font-bold">
                        {t(locale, `billing.method.${LABEL_KEY[key]}`)}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            {/* ── the detail for what is selected, and nothing else ─────────────────── */}
            {selected === 'standing_order' ? (
              <div
                data-testid={`method-detail-standing-order-${row.studentId}`}
                className="mt-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700"
              >
                {mandateLinks
                  .filter((link) => link.studentId === row.studentId)
                  .map((link) => (
                    <div
                      key={link.url}
                      data-testid="sheet-standing-order-row"
                      className="flex items-center justify-between gap-2 mb-2"
                    >
                      <a
                        href={link.url}
                        data-testid="sheet-standing-order-link"
                        // Two anchors reading 'קישור להקמת הוראת קבע' are two links a
                        // screen reader cannot tell apart, and telling them apart is the
                        // whole point of a per-child mandate.
                        aria-label={fill(t(locale, 'billing.standingOrder.linkFor'), {
                          name: link.studentName,
                        })}
                        // Without a target, following it navigates פרופיל away to a third
                        // party's page and the family loses the app.
                        rel="noopener noreferrer"
                        target="_blank"
                        className="text-xs font-bold text-[#0056c5] dark:text-blue-300 shrink-0 cursor-pointer"
                      >
                        {t(locale, 'billing.standingOrder.link')}
                      </a>
                      {/* The amount the mandate will charge every month. A uPay shared
                          link is fixed at one amount and the page it opens does not say
                          which. */}
                      <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                        {[link.planName, money(link.amountAgorot)].filter(Boolean).join(' · ')}
                      </span>
                    </div>
                  ))}
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t(locale, 'billing.standingOrder.instructions')}
                </p>
                {/* G8 on the screen: the app cannot confirm these, so the charges stay open
                    until a manager reconciles them. Saying so is what stops a parent
                    thinking it failed. */}
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t(locale, 'billing.standingOrder.notConfirmable')}
                </p>
              </div>
            ) : null}

            {selected === 'cash' ? (
              <p
                data-testid={`method-detail-cash-${row.studentId}`}
                className="mt-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400"
              >
                {t(locale, 'billing.cash.instructions')}
              </p>
            ) : null}

            {selected === 'upay_card' ? (
              // Only for a card payer. A family that wrote cheques for the season was being
              // told where their credit-card details are handled — a sentence about a thing
              // they do not do, on the screen that answers "am I sorted".
              <p
                data-testid={`method-detail-card-${row.studentId}`}
                className="mt-2.5 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700 text-[11px] text-slate-500 dark:text-slate-400"
              >
                {t(locale, 'people.profile.paymentMethodHint')}
              </p>
            ) : null}
          </section>
        )
      })}

      {/* ── צ׳קים — once for the family, not once per child ────────────────────────────
          A season of cheques is handed over in one go, for everybody. Rendering the button
          inside each child's block would offer the same promise twice and the second press
          would be a 409 the family cannot read. */}
      {anyOnCheques && cheque ? (
        <section
          data-testid="sheet-payments-cheque"
          className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700 text-start"
        >
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
            {t(locale, 'billing.method.cheque')}
          </h3>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {t(locale, 'billing.cheque.instructions')}
          </p>
          {cheque.pendingAgorot !== null ? (
            <p
              data-testid="sheet-cheque-pending"
              className="text-xs font-bold text-amber-800 dark:text-amber-300 mt-2"
            >
              {t(locale, 'billing.cheque.requested')}
            </p>
          ) : cheque.blocked ? (
            <p
              data-testid="sheet-cheque-blocked"
              className="text-xs text-slate-500 dark:text-slate-400 mt-2"
            >
              {t(locale, 'billing.promise.blocked')}
            </p>
          ) : (
            <>
              {cheque.declined ? (
                <p
                  data-testid="sheet-cheque-declined"
                  role="alert"
                  className="text-xs text-[#ba1a1a] dark:text-red-300 mt-2"
                >
                  {t(locale, 'billing.cheque.declined')}
                </p>
              ) : null}
              {/* The breakdown, not one figure: ₪900 with no explanation is the number a
                  parent phones the office about. */}
              <dl className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center justify-between gap-2">
                  <dt>{t(locale, 'billing.prepay.openCharges')}</dt>
                  <dd className="font-bold">
                    <bdi>{money(cheque.openAgorot)}</bdi>
                  </dd>
                </div>
                {cheque.months > 0 && cheque.monthlyTotalAgorot > 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <dt data-testid="sheet-cheque-term">
                      {plural(locale, 'billing.pay.forward', cheque.months)}
                    </dt>
                    <dd className="font-bold">
                      <bdi>{money(cheque.months * cheque.monthlyTotalAgorot)}</bdi>
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-700 pt-1">
                  <dt className="font-bold">{t(locale, 'billing.prepay.total')}</dt>
                  <dd
                    data-testid="sheet-cheque-total"
                    className="font-bold text-slate-900 dark:text-slate-50"
                  >
                    <bdi>{money(chequeTotal)}</bdi>
                  </dd>
                </div>
              </dl>
              <button
                type="button"
                data-testid="sheet-cheque-request"
                disabled={cheque.busy || chequeTotal <= 0}
                onClick={cheque.onRequest}
                className={`mt-2.5 w-full rounded-xl py-2.5 text-xs font-bold transition-transform ${
                  cheque.busy || chequeTotal <= 0
                    ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
                    : 'bg-[#0056c5] text-white active:scale-95 cursor-pointer'
                }`}
              >
                {t(locale, 'billing.cheque.request')}
              </button>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                {t(locale, 'billing.prepay.note')}
              </p>
            </>
          )}
        </section>
      ) : null}

      {error ? (
        <p
          data-testid="method-error"
          role="alert"
          className="text-xs text-[#ba1a1a] dark:text-red-300 text-start"
        >
          {error}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="method-save"
        disabled={busy || answered.length === 0}
        onClick={() => onSave(answered)}
        className={`w-full rounded-xl py-3 text-sm font-bold transition-transform ${
          busy || answered.length === 0
            ? 'bg-slate-200 dark:bg-slate-700 text-slate-500 cursor-not-allowed'
            : 'bg-[#001849] text-white active:scale-95 cursor-pointer'
        }`}
      >
        {busy
          ? t(locale, 'people.profile.paymentMethodSaving')
          : t(locale, 'people.profile.paymentMethodSave')}
      </button>
    </Sheet>
  )
}
