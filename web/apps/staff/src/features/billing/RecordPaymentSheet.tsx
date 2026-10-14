// §5.10's manual payment, as the person collecting it experiences it (owner, 2026-10-14).
//
// **A sheet, not a screen.** This is a short task with one commit, done while somebody
// stands at the door holding money. A pushed screen would take the manager out of the
// evening, give the task its own back button to get lost in, and hide the list that says
// who was being collected from. The sheet dims that list and pushes it back instead.
//
// **Two questions, two steps, one surface.** Who, then what it covers — the sheet changes
// its contents rather than opening a second popup on top of itself. Opened from a family's
// row it skips the first step, because the family is already known.
//
// **One payer, one method, one row.** That is the ledger (`PAYMENT_METHODS`), and it is
// right: a cheque that bounces next week has to be reversible on its own. So a family
// paying cheques for one child and cash for the other produces TWO payments — the screen's
// job is to make that one press and to show both lines before writing either.
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, Search, X } from 'lucide-react'
import { formatAgorot, useNetworkMode } from '@studio/core'
import { useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { CashClient, OpenCharge } from './cashClient'
import { outstandingAgorot } from './households'
import type { Household } from './households'
import { MANUAL_METHODS, groupByChild, planPayments } from './splitByMethod'
import type { ManualMethod } from './splitByMethod'

export function RecordPaymentSheet({
  locale,
  client,
  households,
  openFor = null,
  clock,
  onClose,
  onRecorded,
}: {
  locale: Locale
  client: CashClient
  /** Every family with something open, from the tab's own read. */
  households: readonly Household[]
  /** The family this was opened for, or `null` to ask. */
  openFor?: string | null
  clock: () => Date
  onClose: () => void
  onRecorded: () => void
}) {
  const dialogRef = useModalDialog(true, onClose)
  const [payerId, setPayerId] = useState<string | null>(openFor)
  const [query, setQuery] = useState('')

  const family = households.find((row) => row.payerPersonId === payerId) ?? null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="record-payment-title"
        tabIndex={-1}
        data-testid="record-payment-sheet"
        className="tw-scope max-h-[88vh] w-full space-y-3 overflow-y-auto rounded-t-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-2xl sm:max-w-sm sm:rounded-3xl"
      >
        {family === null ? (
          <PickFamily
            households={households}
            locale={locale}
            onClose={onClose}
            onPick={setPayerId}
            query={query}
            setQuery={setQuery}
          />
        ) : (
          <PickCharges
            client={client}
            clock={clock}
            family={family}
            locale={locale}
            onBack={openFor === null ? () => setPayerId(null) : onClose}
            onRecorded={onRecorded}
          />
        )}
      </div>
    </div>
  )
}

/** Step one. Debtors first, because that is who is usually paying — but everybody is
 *  reachable, since a family settling next term in advance owes nothing yet. */
function PickFamily({
  households,
  locale,
  onClose,
  onPick,
  query,
  setQuery,
}: {
  households: readonly Household[]
  locale: Locale
  onClose: () => void
  onPick: (payerPersonId: string) => void
  query: string
  setQuery: (value: string) => void
}) {
  const needle = query.trim().toLowerCase()
  const matches = households.filter((row) =>
    needle === ''
      ? true
      : [row.title, ...row.studentNames].join(' ').toLowerCase().includes(needle),
  )

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
        <h2 className="text-sm font-black text-[var(--fg)]" id="record-payment-title">
          {t(locale, 'billing.cash.action.record')}
        </h2>
        <button
          type="button"
          aria-label={t(locale, 'common.cancel')}
          data-testid="record-payment-close"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--disabled-surface)] text-[var(--text-muted)]"
        >
          <X aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>

      <label className="relative block">
        <span className="sr-only">{t(locale, 'billing.cash.record.search')}</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute inset-inline-start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
        />
        <input
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-9 py-2.5 text-sm"
          data-testid="record-payment-search"
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder={t(locale, 'billing.cash.record.search')}
          type="search"
          value={query}
        />
      </label>

      <p className="m-0 text-[11px] font-semibold text-[var(--text-muted)]">
        {t(locale, 'billing.cash.record.withDebt')}
      </p>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {matches.map((row) => (
          <li key={row.payerPersonId}>
            <button
              type="button"
              data-testid={`record-payment-pick-${row.payerPersonId}`}
              onClick={() => onPick(row.payerPersonId)}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-start transition-transform active:scale-[0.99]"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-bold text-[var(--fg)]">
                  <bdi>{row.title}</bdi>
                </span>
                <span className="truncate text-[11px] text-[var(--text-muted)]">
                  <bdi>{row.studentNames.join(' · ')}</bdi>
                </span>
              </span>
              <span className="ms-auto font-mono text-sm font-black text-[var(--danger)]">
                {formatAgorot(row.owedAgorot)}
              </span>
              <ChevronLeft aria-hidden="true" className="h-4 w-4 text-[var(--text-muted)] ltr:rotate-180" />
            </button>
          </li>
        ))}
      </ul>
      {matches.length === 0 ? (
        <p className="m-0 text-center text-xs text-[var(--text-muted)]" data-testid="record-payment-none">
          {t(locale, 'billing.cash.debts.clear')}
        </p>
      ) : null}
    </>
  )
}

/** Step two: the family's charges grouped by child, what will be written, and the press. */
function PickCharges({
  client,
  clock,
  family,
  locale,
  onBack,
  onRecorded,
}: {
  client: CashClient
  clock: () => Date
  family: Household
  locale: Locale
  onBack: () => void
  onRecorded: () => void
}) {
  const networkMode = useNetworkMode()
  const [chosen, setChosen] = useState<ReadonlySet<string>>(
    () => new Set(family.charges.map((charge) => charge.id)),
  )
  const [override, setOverride] = useState<ManualMethod | null>(null)
  const [methods, setMethods] = useState<ReadonlyMap<string, string | null>>(new Map())
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map())
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    // A failed read is not a failed sheet: without methods every child falls back to cash,
    // which the manager can change in one tap. Money at a door must not wait on a lookup.
    void client
      .methods(family.payerPersonId)
      .then((rows) => {
        if (!live) return
        setMethods(new Map(rows.map((row) => [row.student_id, row.method])))
        setNames(new Map(rows.map((row) => [row.student_id, row.student_name])))
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client, family.payerPersonId])

  const picked = family.charges.filter((charge) => chosen.has(charge.id))
  const groups = useMemo(
    () => groupByChild(family.charges, names, methods),
    [family.charges, names, methods],
  )
  const plan = useMemo(
    () => planPayments(picked, methods, names, override ?? undefined),
    [picked, methods, names, override],
  )
  const total = plan.reduce((sum, line) => sum + line.amountAgorot, 0)
  const offline = networkMode === 'offline'

  function toggle(id: string): void {
    setChosen((current) => {
      const next = new Set(current)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function toggleChild(charges: readonly OpenCharge[]): void {
    const ids = charges.map((charge) => charge.id)
    const allOn = ids.every((id) => chosen.has(id))
    setChosen((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (allOn) next.delete(id)
        else next.add(id)
      }
      return next
    })
  }

  async function record(): Promise<void> {
    setSaving(true)
    setFailed(false)
    const receivedAt = clock().toISOString()
    const stamp = `${family.payerPersonId}:${receivedAt}`
    try {
      // In sequence, not in parallel: each line is its own payment and the server
      // recomputes the charges' status after every one. Two writes racing over the same
      // family is how a charge ends up allocated twice.
      for (const line of plan) {
        await client.recordCash({
          payerPersonId: family.payerPersonId,
          amountAgorot: line.amountAgorot,
          chargeIds: line.chargeIds,
          receivedAt,
          method: line.method,
          key: `${stamp}:${line.method}`,
        })
      }
      onRecorded()
    } catch {
      setSaving(false)
      setFailed(true)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
        <h2 className="truncate text-sm font-black text-[var(--fg)]" id="record-payment-title">
          <bdi>{family.title}</bdi>
        </h2>
        <button
          type="button"
          data-testid="record-payment-back"
          onClick={onBack}
          className="text-xs font-bold text-[var(--emphasis)]"
        >
          {t(locale, 'billing.cash.record.back')}
        </button>
      </div>

      {groups.map((group) => (
        <section key={group.studentId ?? 'family'} className="space-y-1.5">
          <button
            type="button"
            data-testid={`record-payment-child-${group.studentId ?? 'family'}`}
            onClick={() => toggleChild(group.charges)}
            className="flex w-full items-center justify-between gap-2 px-1 text-start"
          >
            <span className="text-[11px] font-bold text-[var(--text-muted)]">
              <bdi>{group.name}</bdi>
              {group.studentId ? ` · ${t(locale, `billing.method.${group.method}`)}` : ''}
            </span>
          </button>
          <ul className="m-0 flex list-none flex-col p-0">
            {group.charges.map((charge) => {
              const on = chosen.has(charge.id)
              return (
                <li key={charge.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    data-testid={`record-payment-charge-${charge.id}`}
                    onClick={() => toggle(charge.id)}
                    className="flex min-h-12 w-full items-center gap-3 border-t border-[var(--border)] px-1 text-start text-xs font-bold text-[var(--fg)]"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-[11px] ${
                        on
                          ? 'border-[var(--paid)] bg-[var(--paid)] text-[var(--on-emphasis)]'
                          : 'border-[var(--border)] text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                    <span className="truncate">{chargeLabel(locale, charge)}</span>
                    <span className="ms-auto shrink-0 font-mono font-medium text-[var(--text-secondary)]">
                      {formatAgorot(outstandingAgorot(charge))}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {family.charges.length === 0 ? (
        <p className="m-0 text-center text-xs text-[var(--text-muted)]" data-testid="record-payment-no-charges">
          {t(locale, 'billing.cash.record.noCharges')}
        </p>
      ) : null}

      {/* What will be written, before it is — one line per payment. */}
      {plan.length > 1 ? (
        <ul
          className="m-0 flex list-none flex-col gap-1 rounded-xl bg-[var(--surface)] p-3"
          data-testid="record-payment-plan"
        >
          {plan.map((line) => (
            <li key={line.method} className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-bold text-[var(--fg)]">
                {t(locale, 'billing.cash.record.willWrite')
                  .replace('{{amount}}', formatAgorot(line.amountAgorot))
                  .replace('{{method}}', t(locale, `billing.method.${line.method}`))}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                <bdi>{line.childNames.join(' · ')}</bdi>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
        <span className="text-[11px] text-[var(--text-muted)]" data-testid="record-payment-note">
          {plan.length > 1
            ? t(locale, 'billing.cash.record.mixed').replace('{{count}}', String(picked.length))
            : picked.length === 1
              ? t(locale, 'billing.cash.family.selectedOne')
              : t(locale, 'billing.cash.family.selected').replace('{{count}}', String(picked.length))}
        </span>
        <span className="font-mono text-base font-black text-[var(--fg)]" data-testid="record-payment-total">
          {formatAgorot(total)}
        </span>
      </div>

      {offline ? (
        <p className="m-0 text-[11px] font-semibold text-[var(--pending)]" data-testid="record-payment-offline">
          {t(locale, 'billing.cash.family.offline')}
        </p>
      ) : null}
      {failed ? (
        <p className="m-0 text-[11px] font-semibold text-[var(--danger)]" role="alert">
          {t(locale, 'billing.cash.family.failed')}
        </p>
      ) : null}

      <button
        type="button"
        data-testid="record-payment-commit"
        disabled={plan.length === 0 || saving || offline}
        onClick={() => void record()}
        className="min-h-12 w-full rounded-xl bg-[var(--paid)] text-sm font-black text-[var(--on-emphasis)] transition-colors disabled:bg-[var(--disabled-surface)] disabled:text-[var(--text-muted)]"
      >
        {saving
          ? t(locale, 'billing.cash.family.saving')
          : plan.length > 1
            ? t(locale, 'billing.cash.record.commitSplit')
                .replace('{{count}}', String(plan.length))
                .replace('{{amount}}', formatAgorot(total))
            : t(locale, 'billing.cash.record.commitOne')
                .replace('{{amount}}', formatAgorot(total))
                .replace(
                  '{{method}}',
                  t(locale, `billing.method.${plan[0]?.method ?? 'cash'}`),
                )}
      </button>

      {/* The evening beats the records: one press puts everything on one method. */}
      <div className="grid grid-cols-3 gap-1.5" data-testid="record-payment-override">
        {MANUAL_METHODS.map((method) => (
          <button
            key={method}
            type="button"
            aria-pressed={override === method}
            data-testid={`record-payment-all-${method}`}
            onClick={() => setOverride((current) => (current === method ? null : method))}
            className={`min-h-10 rounded-xl border text-[11px] font-bold transition-colors ${
              override === method
                ? 'border-[var(--paid)] bg-[var(--paid-tint)] text-[var(--paid)]'
                : 'border-[var(--border)] text-[var(--text-secondary)]'
            }`}
          >
            {t(locale, 'billing.cash.record.allAs').replace(
              '{{method}}',
              t(locale, `billing.method.${method}`),
            )}
          </button>
        ))}
      </div>
    </>
  )
}

function chargeLabel(locale: Locale, charge: OpenCharge): string {
  if (charge.period_year !== null && charge.period_month !== null) {
    return `${String(charge.period_month).padStart(2, '0')}/${charge.period_year}`
  }
  return t(
    locale,
    charge.product_id ? 'billing.cash.family.chargeItem' : 'billing.cash.family.chargeOther',
  )
}
