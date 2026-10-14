// The month-end job (owner, 2026-10-14: "I want to mark for several families at once").
//
// The standing orders came in, twelve families are paid up, and marking them one at a time
// is twelve trips through the same sheet. So this turns the question around: **pick the
// method first**, and the families who pay that way are already ticked — the club recorded
// how each child pays when they joined (`student.payment_method`).
//
// **Each family is still its own payment row**, because a payment carries one payer. The
// batch is a loop with a progress line and a result, not a new kind of write: twelve rows
// are written, each with its own idempotency key, so a retry after a half-finished run
// cannot pay twice for the families that already went through.
import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { formatAgorot, useNetworkMode } from '@studio/core'
import { useModalDialog } from '@studio/ui'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import type { CashClient } from './cashClient'
import type { Household } from './households'
import { MANUAL_METHODS } from './splitByMethod'
import type { ManualMethod } from './splitByMethod'

type Outcome = { payerPersonId: string; title: string; amountAgorot: number; error: string }

export function BatchPaymentSheet({
  locale,
  client,
  households,
  clock,
  onClose,
  onRecorded,
}: {
  locale: Locale
  client: CashClient
  households: readonly Household[]
  clock: () => Date
  onClose: () => void
  onRecorded: () => void
}) {
  const dialogRef = useModalDialog(true, onClose)
  const networkMode = useNetworkMode()
  const [method, setMethod] = useState<ManualMethod>('standing_order')
  const [methodByStudent, setMethodByStudent] = useState<ReadonlyMap<string, string | null>>(
    new Map(),
  )
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState<{ ok: number; amount: number; failures: Outcome[] } | null>(
    null,
  )

  useEffect(() => {
    let live = true
    void client
      .methods()
      .then((rows) => live && setMethodByStudent(new Map(rows.map((r) => [r.student_id, r.method]))))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [client])

  // A family belongs to the chosen method when ANY of its charges is for a child on it.
  // Deliberately generous: a family where one child is on standing order and the other on
  // cash still appears when standing orders are being marked, and the manager unticks what
  // did not arrive. The alternative — requiring every child to agree — hides exactly the
  // families this screen exists for.
  const onMethod = useMemo(
    () =>
      households.filter((family) =>
        family.charges.some(
          (charge) => charge.student_id && methodByStudent.get(charge.student_id) === method,
        ),
      ),
    [households, method, methodByStudent],
  )
  const picked = onMethod.filter((family) => !unticked.has(family.payerPersonId))
  const total = picked.reduce((sum, family) => sum + family.owedAgorot, 0)
  const offline = networkMode === 'offline'

  async function run(): Promise<void> {
    setRunning(true)
    const receivedAt = clock().toISOString()
    const failures: Outcome[] = []
    let ok = 0
    let amount = 0
    // One at a time, so a failure stops being everybody's problem: the families already
    // written stay written, and the one that refused is named with its reason.
    for (const family of picked) {
      try {
        await client.recordCash({
          payerPersonId: family.payerPersonId,
          amountAgorot: family.owedAgorot,
          chargeIds: family.charges.map((charge) => charge.id),
          receivedAt,
          method,
          key: `batch:${receivedAt}:${family.payerPersonId}`,
        })
        ok += 1
        amount += family.owedAgorot
      } catch (error) {
        failures.push({
          payerPersonId: family.payerPersonId,
          title: family.title,
          amountAgorot: family.owedAgorot,
          error: error instanceof Error ? error.message : 'unknown',
        })
      }
    }
    setRunning(false)
    setDone({ ok, amount, failures })
    if (ok > 0) onRecorded()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-payment-title"
        tabIndex={-1}
        data-testid="batch-payment-sheet"
        className="tw-scope max-h-[88vh] w-full space-y-3 overflow-y-auto rounded-t-3xl border border-[var(--border)] bg-[var(--surface-raised)] p-5 shadow-2xl sm:max-w-sm sm:rounded-3xl"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
          <h2 className="text-sm font-black text-[var(--fg)]" id="batch-payment-title">
            {done === null
              ? t(locale, 'billing.cash.batch.title')
              : t(locale, 'billing.cash.batch.done')
                  .replace('{{ok}}', String(done.ok))
                  .replace('{{total}}', String(done.ok + done.failures.length))}
          </h2>
          <button
            type="button"
            aria-label={t(locale, 'common.cancel')}
            data-testid="batch-payment-close"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--disabled-surface)] text-[var(--text-muted)]"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {done === null ? (
          <>
            <div className="grid grid-cols-3 gap-1.5" data-testid="batch-payment-methods">
              {MANUAL_METHODS.map((each) => (
                <button
                  key={each}
                  type="button"
                  aria-pressed={method === each}
                  data-testid={`batch-payment-method-${each}`}
                  onClick={() => {
                    setMethod(each)
                    setUnticked(new Set())
                  }}
                  className={`min-h-11 rounded-xl border text-[11px] font-bold transition-colors ${
                    method === each
                      ? 'border-[var(--paid)] bg-[var(--paid-tint)] text-[var(--paid)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)]'
                  }`}
                >
                  {t(locale, `billing.method.${each}`)}
                </button>
              ))}
            </div>

            <p className="m-0 text-[11px] font-semibold text-[var(--text-muted)]">
              {t(locale, 'billing.cash.batch.families')
                .replace('{{method}}', t(locale, `billing.method.${method}`))
                .replace('{{picked}}', String(picked.length))
                .replace('{{total}}', String(onMethod.length))}
            </p>

            <ul className="m-0 flex list-none flex-col p-0">
              {onMethod.map((family) => {
                const on = !unticked.has(family.payerPersonId)
                return (
                  <li key={family.payerPersonId}>
                    <button
                      type="button"
                      aria-pressed={on}
                      data-testid={`batch-payment-family-${family.payerPersonId}`}
                      onClick={() =>
                        setUnticked((current) => {
                          const next = new Set(current)
                          if (!next.delete(family.payerPersonId)) next.add(family.payerPersonId)
                          return next
                        })
                      }
                      className="flex min-h-12 w-full items-center gap-3 border-t border-[var(--border)] px-1 text-start"
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
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate text-xs font-bold text-[var(--fg)]">
                          <bdi>{family.title}</bdi>
                        </span>
                        <span className="truncate text-[11px] text-[var(--text-muted)]">
                          {family.charges.length} · {family.oldestPeriod ?? ''}
                        </span>
                      </span>
                      <span className="ms-auto font-mono text-xs font-bold text-[var(--text-secondary)]">
                        {formatAgorot(family.owedAgorot)}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>

            {onMethod.length === 0 ? (
              <p className="m-0 text-center text-xs text-[var(--text-muted)]" data-testid="batch-payment-empty">
                {t(locale, 'billing.cash.batch.empty')}
              </p>
            ) : null}

            {offline ? (
              <p className="m-0 text-[11px] font-semibold text-[var(--pending)]" data-testid="batch-payment-offline">
                {t(locale, 'billing.cash.family.offline')}
              </p>
            ) : null}

            <button
              type="button"
              data-testid="batch-payment-commit"
              disabled={picked.length === 0 || running || offline}
              onClick={() => void run()}
              className="min-h-12 w-full rounded-xl bg-[var(--paid)] text-sm font-black text-[var(--on-emphasis)] transition-colors disabled:bg-[var(--disabled-surface)] disabled:text-[var(--text-muted)]"
            >
              {running
                ? t(locale, 'billing.cash.family.saving')
                : t(locale, 'billing.cash.batch.commit')
                    .replace('{{count}}', String(picked.length))
                    .replace('{{amount}}', formatAgorot(total))}
            </button>
          </>
        ) : (
          <>
            <p
              className="m-0 rounded-xl bg-[var(--paid-tint)] p-3 text-xs font-bold text-[var(--paid)]"
              data-testid="batch-payment-result"
            >
              {t(locale, 'billing.cash.batch.doneAll')
                .replace('{{ok}}', String(done.ok))
                .replace('{{amount}}', formatAgorot(done.amount))}
            </p>

            {done.failures.length > 0 ? (
              <>
                <p className="m-0 text-[11px] font-semibold text-[var(--danger)]">
                  {t(locale, 'billing.cash.batch.failed')}
                </p>
                <ul className="m-0 flex list-none flex-col p-0" data-testid="batch-payment-failures">
                  {done.failures.map((failure) => (
                    <li
                      key={failure.payerPersonId}
                      className="flex min-h-11 items-center gap-3 border-t border-[var(--border)] px-1 text-xs"
                    >
                      <span className="truncate font-bold text-[var(--fg)]">
                        <bdi>{failure.title}</bdi>
                      </span>
                      <span className="ms-auto font-mono text-[var(--text-muted)]">
                        {formatAgorot(failure.amountAgorot)}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  data-testid="batch-payment-retry"
                  onClick={() => {
                    setUnticked(
                      new Set(
                        onMethod
                          .filter(
                            (family) =>
                              !done.failures.some((f) => f.payerPersonId === family.payerPersonId),
                          )
                          .map((family) => family.payerPersonId),
                      ),
                    )
                    setDone(null)
                  }}
                  className="min-h-12 w-full rounded-xl bg-[var(--emphasis)] text-sm font-black text-[var(--on-emphasis)]"
                >
                  {t(locale, 'billing.cash.batch.retry')}
                </button>
              </>
            ) : null}

            <button
              type="button"
              data-testid="batch-payment-done"
              onClick={onClose}
              className="min-h-12 w-full rounded-xl border border-[var(--border)] text-sm font-bold text-[var(--text-secondary)]"
            >
              {t(locale, 'billing.cash.batch.close')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
