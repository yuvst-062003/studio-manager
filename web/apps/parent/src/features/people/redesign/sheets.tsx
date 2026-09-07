// The four sheets פרופיל's menu opens. Each wraps markup that already existed as a section
// on the old stacked screen — the reorder of 2026-09-06 changed where they live, not what
// they look like inside.
import { Award, ChevronLeft, Plus } from 'lucide-react'
import { PushSetting } from '../../comms/PushSetting'
import { AccessibilityMenu } from '@studio/ui'
import { fill } from '@studio/core'
import { plural, t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { Sheet } from './Sheet'
import { SheetFailed } from './SheetFailed'
import { ProfilePreferences } from './ProfileTop'
import { ContactActions } from './ContactSheet'
import { DirectionsActions } from './DirectionsActions'
import { AccountControls } from '../../shell/AccountControls'
import type { AccountControlsProps } from '../../shell/AccountControls'
import type { Coverage } from './derive'
import type { ClubDetails, ProfileChild } from './types'

/* ── המתאמנים שלי ─────────────────────────────────────────────────────────────────────
 *
 * The attendance percentage lives HERE, on the child's own row, and nowhere else on this
 * tab. It was a section of its own until the owner's review; that section needed a child
 * picker, which is the tell that it was on the wrong screen. Tapping a row opens the
 * child's card, where the full record — sessions, belts, health, plan — already is.
 */
export function TraineesSheet({
  childList,
  locale,
  failed,
  onRetry,
  onClose,
}: {
  childList: readonly ProfileChild[]
  locale: Locale
  /** The roster read failed. NOT the same as an empty roster, which is a family with no
   *  children in the club — telling that to a family that has three is the lie this flag
   *  exists to stop. */
  failed: boolean
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <Sheet
      title={t(locale, 'people.profile.traineesTitle')}
      subtitle={t(locale, 'people.profile.traineesSub')}
      locale={locale}
      testId="sheet-trainees"
      onClose={onClose}
    >
      <div className="space-y-2.5">
        {failed ? <SheetFailed locale={locale} onRetry={onRetry} /> : null}

        {childList.map((child) => (
          <a
            key={child.id}
            href={`#/student/${child.id}`}
            data-testid={`sheet-trainee-${child.id}`}
            className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-[0.99] transition-all cursor-pointer"
          >
            <span className="w-10 h-10 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5 text-slate-400" aria-hidden="true" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                  {child.displayName}
                </span>
                {child.beltName ? (
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white shrink-0"
                    style={{ backgroundColor: child.beltColorHex ?? '#64748b' }}
                  >
                    {child.beltName}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 shrink-0">{t(locale, 'people.profile.beltUnset')}</span>
                )}
              </span>
              {/* The attendance number, on the child it belongs to. `null` renders nothing —
                  a server that has not computed a rate is not a rate of zero. */}
              {child.attendancePercent !== null ? (
                <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t(locale, 'people.profile.attendanceLabel')}: {child.attendancePercent}%
                </span>
              ) : null}
              {child.needsDeclaration ? (
                <span className="inline-flex items-center gap-1 mt-1 text-[10px] font-bold text-[#ba1a1a] dark:text-red-300 bg-[#ffdad6] dark:bg-red-500/15 px-2 py-0.5 rounded-full">
                  {t(locale, 'people.profile.needsDeclaration')}
                </span>
              ) : null}
            </span>
            <ChevronLeft className="w-4 h-4 text-slate-300 shrink-0" aria-hidden="true" />
          </a>
        ))}

        <a
          href="#/add-child"
          data-testid="sheet-add-child"
          className="flex items-center justify-center gap-1.5 p-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-600 text-sm font-bold text-[#0056c5] dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-400/10 transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>{t(locale, 'people.profile.addChild')}</span>
        </a>
      </div>
    </Sheet>
  )
}

/* ── תשלומים ──────────────────────────────────────────────────────────────────────────
 *
 * ONE SENTENCE OF STATUS, then how you pay, then the detail behind a link.
 *
 * The screen this replaced led with "סך החיובים ₪1,280 / שולם ₪960" — a bookkeeper's view,
 * and the owner's review said the filling made no sense. It does not: a family that wrote
 * cheques for the season has already paid, and a charged-versus-paid pair tells them
 * nothing about whether they are sorted. `coverageFrom` answers the question they actually
 * have, and the answer differs by method exactly as they said it would.
 */
/** One child's הוראת קבע mandate link. A LIST, not a single link (payment-routes §6): a
 *  uPay shared link charges a FIXED amount, so a payer with a child on 300 and a child on
 *  550 needs both, labelled — one bare link has them sign one mandate and underpay for the
 *  other child every month. */
export type MandateLinkRow = {
  studentName: string
  planName: string
  amountAgorot: number
  url: string
}

/**
 * The cheque route, moved here from the payments screen on 2026-09-07.
 *
 * Cheques buy a whole season, so this is not a monthly decision and it stopped competing
 * for attention every month beside the one that is. Nothing about the mechanism changed:
 * it is still one `payment_promise` with `method='cheque'`, decided by a manager.
 */
export type ChequeRoute = {
  /** How many months of cheques the club collects at a time — the CLUB's number. */
  months: number
  monthlyTotalAgorot: number
  /** What is open right now. The promise settles this AND buys `months` forward. */
  openAgorot: number
  chargeIds: readonly string[]
  /** A cheque promise already with the manager, or `null`. */
  pendingAgorot: number | null
  /** The OTHER route holds the live promise. Said, rather than left as a card with a
   *  missing button, which reads as a bug. */
  blocked: boolean
  /** The last decided cheque promise was declined and nothing is pending. */
  declined: boolean
  busy: boolean
  onRequest: () => void
}

export function PaymentsSheet({
  coverage,
  locale,
  failed,
  onRetry,
  methodLabel,
  methodIsCard,
  mandateLinks,
  cheque,
  money,
  monthLabel,
  onClose,
}: {
  coverage: Coverage | null
  locale: Locale
  /** A money read failed. Without this the sheet renders `loading` for ever, because
   *  `coverage` is `null` until BOTH the balance and the charges have landed. */
  failed: boolean
  onRetry: () => void
  methodLabel: string | null
  /** Whether the family actually pays by card. The PCI note below is only true for them. */
  methodIsCard: boolean
  /** §5.10's הוראת קבע, moved here from the payments screen on 2026-09-07: a standing order
   *  moves the money by itself, so it is set up once and never decided again. */
  mandateLinks: readonly MandateLinkRow[]
  /** `null` while the money reads are still in flight — the route is not offered until its
   *  own numbers are known, because a cheque button priced at nothing is a promise for
   *  nothing that a manager then has to decline. */
  cheque: ChequeRoute | null
  money: (agorot: number) => string
  /** `(year, month)` → the localized month heading. `formatMonthLabel` gives 'אוגוסט 2026'
   *  in one string, so the sentence has one token and not a hand-ordered pair — Russian
   *  needs the genitive and English puts the year the other side of a comma. */
  monthLabel: (year: number, month: number) => string
  onClose: () => void
}) {
  // `months × monthly` is integer arithmetic on two integers the server sent (G2), and it
  // is computed ONCE here so the breakdown and the button cannot round it differently.
  const chequeTotal = cheque
    ? cheque.openAgorot + cheque.months * cheque.monthlyTotalAgorot
    : 0

  return (
    <Sheet
      title={t(locale, 'people.profile.billingTitle')}
      locale={locale}
      testId="sheet-payments"
      onClose={onClose}
    >
      {failed ? (
        <SheetFailed locale={locale} onRetry={onRetry} />
      ) : coverage === null ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{t(locale, 'people.profile.loading')}</p>
      ) : coverage.kind === 'owed' ? (
        <div
          data-testid="sheet-payments-owed"
          className="bg-[#ffdad6] dark:bg-red-500/15 border border-red-200 dark:border-red-500/25 rounded-2xl p-4 flex items-center justify-between gap-3"
        >
          <a
            href="#/payments"
            className="bg-[#ba1a1a] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs hover:bg-red-800 active:scale-95 transition-transform shrink-0 cursor-pointer"
          >
            {t(locale, 'people.profile.payNow')}
          </a>
          <div className="text-start">
            <p className="font-bold text-[#ba1a1a] dark:text-red-300 text-sm">
              {t(locale, 'people.profile.coverageOwedTitle')} · {money(coverage.balanceAgorot)}
            </p>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5">
              {coverage.openChargeCount === 1
                ? t(locale, 'people.profile.openChargeOne')
                : fill(t(locale, 'people.profile.openCharges'), { count: coverage.openChargeCount })}
            </p>
          </div>
        </div>
      ) : (
        <div
          data-testid="sheet-payments-clear"
          className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 rounded-2xl p-4 text-start"
        >
          <p className="font-bold text-emerald-800 dark:text-emerald-300 text-sm">
            {coverage.kind === 'covered'
              ? fill(t(locale, 'people.profile.coverageCovered'), {
                  month: monthLabel(coverage.year, coverage.month),
                })
              : t(locale, 'people.profile.coverageSettled')}
          </p>
          <p className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
            {coverage.kind === 'covered'
              ? t(locale, 'people.profile.coverageCoveredNote')
              : t(locale, 'people.profile.coverageSettledNote')}
          </p>
        </div>
      )}

      <div
        data-testid="sheet-payments-method"
        className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700"
      >
        {/* No 'עדכון' link to #/payments any more. That screen answers "what do I owe and
            how do I pay it right now"; the two routes below are the ones set up ONCE, and
            sending a parent to the monthly screen to arrange a standing order was pointing
            at the wrong place from the moment they moved here. */}
        <div className="text-start min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">{t(locale, 'people.profile.paymentMethod')}</p>
          <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
            {methodLabel ?? t(locale, 'people.profile.paymentMethodNone')}
          </p>
        </div>
      </div>

      {/* ── הוראת קבע ─────────────────────────────────────────────────────────────────
          Set up once, on the clearing company's own site, and then it moves the money by
          itself. An empty list renders the instructions and no anchor, which is exactly
          what this rendered before there was a per-plan source at all. */}
      <section
        data-testid="sheet-payments-standing-order"
        className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700 text-start"
      >
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50">
          {t(locale, 'billing.method.standingOrder')}
        </h3>
        {mandateLinks.map((link) => (
          <div
            key={link.url}
            data-testid="sheet-standing-order-row"
            className="flex items-center justify-between gap-2 mt-2.5"
          >
            <a
              href={link.url}
              data-testid="sheet-standing-order-link"
              // Two anchors reading 'קישור להקמת הוראת קבע' are two links a screen reader
              // cannot tell apart, and telling them apart is the whole point of a
              // per-child mandate.
              aria-label={fill(t(locale, 'billing.standingOrder.linkFor'), {
                name: link.studentName,
              })}
              // Without a target, following it navigates פרופיל away to a third party's
              // page and the family loses the app.
              rel="noopener noreferrer"
              target="_blank"
              className="text-xs font-bold text-[#0056c5] dark:text-blue-300 shrink-0 cursor-pointer"
            >
              {t(locale, 'billing.standingOrder.link')}
            </a>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-900 dark:text-slate-50 truncate">
                {link.studentName}
              </span>
              {/* The amount the mandate will charge every month. A uPay shared link is
                  fixed at one amount and the page it opens does not say which. */}
              <span className="block text-xs text-slate-500 dark:text-slate-400 truncate">
                {[link.planName, money(link.amountAgorot)].filter(Boolean).join(' · ')}
              </span>
            </span>
          </div>
        ))}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
          {t(locale, 'billing.standingOrder.instructions')}
        </p>
        {/* G8 on the screen: the app cannot confirm these, so the charges stay open until
            a manager reconciles them. Saying so is what stops a parent thinking it failed. */}
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {t(locale, 'billing.standingOrder.notConfirmable')}
        </p>
      </section>

      {/* ── צ׳קים ─────────────────────────────────────────────────────────────────────
          A season, handed over once. Same promise row and same manager decision as cash —
          the payment-routes spec §8's point is that cheques are cash with a different word
          on the payment. */}
      {cheque ? (
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

      {/* Only for a card payer. A family that wrote cheques for the season was being told
          where their credit-card details are handled — a sentence about a thing they do not
          do, on the one screen that is supposed to answer "am I sorted". */}
      {methodIsCard || methodLabel === null ? (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 text-start">
          {t(locale, 'people.profile.paymentMethodHint')}
        </p>
      ) : null}

      {/* The list a bulk payer actually wants: five cheques, not twelve monthly charges.
          `#/payments/history` already reads `payments`, not `charges`. */}
      <a
        href="#/payments/history"
        data-testid="sheet-payments-history"
        className="block text-center text-xs font-bold text-[#0056c5] dark:text-blue-300 py-2 cursor-pointer"
      >
        {t(locale, 'people.profile.allTransactions')}
      </a>
    </Sheet>
  )
}

/* ── המועדון ──────────────────────────────────────────────────────────────────────────
 * The dojo and the contact actions, merged: both answer "how do I reach the club", and two
 * rows for one question is what fills a screen.
 *
 * **Two LABELLED groups inside it, though** (owner review, 2026-09-06). Merging the sheets
 * was right; letting the buttons run together was not. "Send the club an email" and "drive
 * to the club" are different errands, and an unlabelled row of five made the parent read
 * every icon to find out which was which. Each group now says what it is for.
 */
export function ClubSheet({
  club,
  locale,
  failed,
  onRetry,
  onClose,
}: {
  club: ClubDetails | null
  locale: Locale
  /** The studio read failed. Without it the sheet says the club has set no address and no
   *  contact details, which is a statement about the CLUB made from a network error. */
  failed: boolean
  onRetry: () => void
  onClose: () => void
}) {
  return (
    <Sheet
      title={t(locale, 'people.profile.clubTitle')}
      subtitle={club?.name ?? null}
      locale={locale}
      testId="sheet-club"
      onClose={onClose}
    >
      {failed ? <SheetFailed locale={locale} onRetry={onRetry} /> : null}

      {/* `<section aria-labelledby>` and not a bare heading: a screen reader user moving by
          landmark meets "צור קשר עם המועדון" and "פרטי הגעה" as two places, which is what
          the sighted parent sees. */}
      <section aria-labelledby="club-contact-heading" className="space-y-2.5">
        <h4
          id="club-contact-heading"
          className="text-xs font-bold text-slate-500 dark:text-slate-400 text-start"
        >
          {t(locale, 'people.profile.contactGroup')}
        </h4>
        <ContactActions club={club} locale={locale} />
      </section>

      <section aria-labelledby="club-directions-heading" className="space-y-2.5">
        <h4
          id="club-directions-heading"
          className="text-xs font-bold text-slate-500 dark:text-slate-400 text-start"
        >
          {t(locale, 'people.profile.directionsGroup')}
        </h4>
        <DirectionsActions address={club?.address ?? null} locale={locale} />
      </section>
    </Sheet>
  )
}

/* ── הגדרות ───────────────────────────────────────────────────────────────────────────
 * Language, theme, the two links, and the account controls the deleted drawer left behind.
 */
export function SettingsSheet({
  locale,
  locales,
  localeLabel,
  onChooseLocale,
  theme,
  onChooseTheme,
  account,
  onClose,
}: {
  locale: Locale
  locales: readonly string[]
  localeLabel: (code: string) => string
  onChooseLocale: (code: string) => void
  theme: 'light' | 'dark' | 'system'
  onChooseTheme: (next: 'light' | 'dark' | 'system') => void
  account: AccountControlsProps & { locale: Parameters<typeof AccountControls>[0]['locale'] }
  onClose: () => void
}) {
  return (
    <Sheet
      title={t(locale, 'people.profile.menuSettings')}
      locale={locale}
      testId="sheet-settings"
      onClose={onClose}
    >
      <ProfilePreferences
        locale={locale}
        locales={locales}
        localeLabel={localeLabel}
        onChooseLocale={onChooseLocale}
        theme={theme}
        onChooseTheme={onChooseTheme}
      />

      <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-100 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
        {/* התראות. Moved off עדכונים (owner, 2026-09-07): a feed is not the place to be
            asked a question every visit, nor to be told permanently that your phone refused
            one. It sits above privacy and נגישות because unlike them it is a preference. */}
        <PushSetting locale={locale} />
        <a
          href="#/privacy"
          className="flex items-center justify-between px-3.5 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
        >
          <span>{t(locale, 'people.profile.privacy')}</span>
          <ChevronLeft className="w-4 h-4 text-slate-400" aria-hidden="true" />
        </a>
        <a
          href="#/calendar"
          data-testid="link-calendar"
          className="flex items-center justify-between px-3.5 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
        >
          <span>{t(locale, 'people.profile.calendarFeed')}</span>
          <ChevronLeft className="w-4 h-4 text-slate-400" aria-hidden="true" />
        </a>
        {/* נגישות. The SAME control the signed-out screens float in the corner — the panel,
            the adjustments and the legally required statement are all `AccessibilityMenu`'s;
            only the opener is drawn here, so this row cannot drift from that one. It sits
            beside privacy on purpose: both are rights rather than preferences. */}
        <AccessibilityMenu
          locale={locale}
          renderTrigger={({ open, toggle }) => (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={open}
              data-testid="a11y-open"
              onClick={toggle}
              className="w-full flex items-center justify-between px-3.5 py-3 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              <span>{t(locale, 'common.a11y.title')}</span>
              <ChevronLeft className="w-4 h-4 text-slate-400" aria-hidden="true" />
            </button>
          )}
        />
      </div>

      <AccountControls {...account} />
    </Sheet>
  )
}

