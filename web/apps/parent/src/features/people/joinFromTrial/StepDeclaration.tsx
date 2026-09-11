// Step 1 of 3 — what the family already wrote, and the one thing that is missing.
//
// **It shows rather than asks, and that is the whole point of this step** (owner,
// 2026-09-12: "he already signed health... in the health he will see what he wrote and
// place to signature"). The screen this replaces sent a converting family through the full
// thirteen-question declaration from scratch. They had answered it an hour earlier on the
// booking form — `TrialBookingPage` renders the current `kind=full` template minus its
// clause — so the app was asking a parent to type their child's medical history twice and
// treating the second copy as the real one.
//
// **The two things the booking form deliberately does not take, it takes here.** §2's door
// records a typed name and a date in place of a drawn signature, and skips the template's
// `clause` question because "choosing one on a family's behalf would have the app make a
// legal statement for them". Both are asked here, once, on the same screen as the answers
// they apply to — which is what makes them a signature on a document the signer has read.
//
// **The answers are read-only and say so.** A family whose circumstances changed since the
// trial is pointed at the full form on the trainee card rather than given a half-editable
// copy here: this screen's job is to confirm a declaration, and a screen that both shows
// and edits one is a screen where "is this what you told us" has no answer.
import { CalendarCheck, HeartPulse, ShieldCheck } from 'lucide-react'
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
import { SignatureField } from '../../onboarding/wizard/parts/SignatureField'
import { applicableClause, clauseTextKey, CLAUSE_QUESTION_ID } from '../../health/clauses'
import { isVisible } from '../../health/healthClient'
import type { AnswerValue, TemplateSchema } from '../../health/healthClient'

/** One line of the recap. `value` is already formatted — the screen formats, the state
 *  stores, the same rule the wizard's own types file sets out. */
type RecapRow = { id: string; label: string; value: string }

/**
 * The stored answers, in the template's own order, as lines a person can read.
 *
 * **Only questions the template still asks**, and only ones this family answered. A stored
 * answer whose question was removed from the form since would otherwise print as a bare id;
 * an unanswered one would print as an empty row that reads like a question nobody asked.
 *
 * The `clause` question is skipped: it is not an answer, it is the sentence below.
 */
export function recapRows(
  schema: TemplateSchema | null,
  answers: Readonly<Record<string, AnswerValue>>,
  locale: Locale,
): RecapRow[] {
  if (!schema) return []
  const rows: RecapRow[] = []
  for (const section of schema.sections ?? []) {
    for (const question of section.questions ?? []) {
      if (question.type === 'clause' || question.id === CLAUSE_QUESTION_ID) continue
      if (!isVisible(question, answers)) continue
      const value = answers[question.id]
      if (value === undefined || value === null || value === '') continue
      const text =
        typeof value === 'boolean'
          ? t(locale, value ? 'health.declaration.yes' : 'health.declaration.no')
          : String(value)
      rows.push({ id: question.id, label: question.label ?? question.id, value: text })
    }
  }
  return rows
}

export function StepDeclaration({
  locale,
  schema,
  answers,
  declaredBy,
  declaredAt,
  clauseConfirmed,
  signatureDataUrl,
  showErrors,
  failed,
  onClause,
  onSignature,
}: {
  locale: Locale
  schema: TemplateSchema | null
  answers: Readonly<Record<string, AnswerValue>>
  declaredBy: string | null
  declaredAt: string | null
  clauseConfirmed: boolean
  signatureDataUrl: string
  showErrors: boolean
  failed: boolean
  onClause: (confirmed: boolean) => void
  onSignature: (dataUrl: string) => void
}) {
  const rows = recapRows(schema, answers, locale)
  // Derived from the answers, never chosen: a family that answered yes to asthma may not be
  // offered "no medical limitations of any kind". `clauses.ts` holds the rule and the server
  // re-derives it on submit, so this copy being wrong is a 422 and never a false statement.
  const clause = schema ? applicableClause(schema, answers) : null
  const signatureError =
    showErrors && !signatureDataUrl ? t(locale, 'people.joinClub.declaration.signatureRequired') : null

  return (
    <div className="flex flex-col gap-3.5" data-testid="join-step-declaration">
      <header className="flex items-start gap-2.5">
        <div className="w-10 h-10 rounded-xl bg-[var(--wz-accent)]/15 text-[var(--wz-accent)] flex items-center justify-center shrink-0">
          <HeartPulse className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[19px] font-bold text-[var(--wz-heading)] leading-tight">
            {t(locale, 'people.joinClub.declaration.title')}
          </h2>
          <p className="text-[13px] text-[var(--wz-secondary)] leading-relaxed mt-0.5">
            {t(locale, 'people.joinClub.declaration.lead')}
          </p>
        </div>
      </header>

      {rows.length === 0 ? (
        <p
          className="p-3.5 rounded-xl bg-[var(--wz-raised)] border border-[var(--wz-tint)] text-[13px] text-[var(--wz-secondary)]"
          data-testid="join-declaration-empty"
        >
          {t(locale, 'people.joinClub.declaration.empty')}
        </p>
      ) : (
        <section className="rounded-2xl bg-[var(--wz-surface)] border border-[var(--wz-tint)] overflow-hidden">
          <div className="px-3.5 py-2.5 bg-[var(--wz-raised)] border-b border-[var(--wz-tint)] flex items-center justify-between gap-2">
            <span className="text-[13px] font-bold text-[var(--wz-heading)]">
              {t(locale, 'people.joinClub.declaration.answers')}
            </span>
            {declaredBy || declaredAt ? (
              <span
                className="text-[11px] text-[var(--wz-tertiary)] flex items-center gap-1 min-w-0"
                data-testid="join-declaration-provenance"
              >
                <CalendarCheck className="w-3.5 h-3.5 shrink-0" />
                {/* Who pressed and when, because that is what was "signed" at the trial —
                    §2's door takes a typed name and a date, not a drawn signature, so
                    implying a pad was used would misdescribe the record. */}
                <bdi className="truncate">
                  {declaredBy ?? ''}
                  {declaredBy && declaredAt ? ' · ' : ''}
                  {declaredAt ? new Date(declaredAt).toLocaleDateString('he-IL') : ''}
                </bdi>
              </span>
            ) : null}
          </div>
          <dl className="divide-y divide-[var(--wz-tint)]" data-testid="join-declaration-recap">
            {rows.map((row) => (
              <div key={row.id} className="px-3.5 py-2.5 flex items-start justify-between gap-3">
                <dt className="text-[13px] text-[var(--wz-secondary)] leading-snug">{row.label}</dt>
                <dd className="text-[13px] font-semibold text-[var(--wz-ink)] shrink-0">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
          <p className="px-3.5 py-2.5 bg-[var(--wz-raised)] border-t border-[var(--wz-tint)] text-[11.5px] text-[var(--wz-tertiary)] leading-relaxed">
            <span className="font-semibold text-[var(--wz-secondary)]">
              {t(locale, 'people.joinClub.declaration.changed')}
            </span>{' '}
            {t(locale, 'people.joinClub.declaration.changedHint')}
          </p>
        </section>
      )}

      {clause ? (
        <div
          className={`p-3.5 rounded-xl border flex flex-col gap-2.5 transition-all ${
            showErrors && !clauseConfirmed
              ? 'bg-red-50/40 border-2 border-red-400'
              : 'bg-[var(--wz-raised)] border-[var(--wz-tint)]'
          }`}
        >
          <span className="text-[13px] font-bold text-[var(--wz-heading)] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-[var(--wz-accent)]" />
            {t(locale, 'health.declaration.title')}
          </span>
          <p
            className="text-[12px] text-[var(--wz-secondary)] leading-relaxed"
            data-testid="join-declaration-clause"
          >
            {t(locale, clauseTextKey(clause))}
          </p>
          <label className="flex items-start gap-2.5 p-2 rounded-lg cursor-pointer bg-[var(--wz-surface)] border border-[var(--wz-line-strong)]/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--wz-accent)]">
            <input
              type="checkbox"
              checked={clauseConfirmed}
              onChange={(event) => onClause(event.target.checked)}
              data-testid="join-declaration-confirm"
              className="w-5 h-5 mt-0.5 accent-[var(--wz-accent)]"
            />
            <span className="text-[12px] text-[var(--wz-ink)] font-medium">
              {t(locale, 'health.declaration.clause.confirm')}{' '}
              <span className="text-red-500 font-bold">*</span>
            </span>
          </label>
          {showErrors && !clauseConfirmed ? (
            <p className="text-[11.5px] text-red-600 font-medium" role="alert">
              {t(locale, 'people.joinClub.declaration.clauseRequired')}
            </p>
          ) : null}
        </div>
      ) : null}

      <SignatureField
        label={t(locale, 'people.joinClub.declaration.sign')}
        clearLabel={t(locale, 'people.joinClub.declaration.clearSignature')}
        promptLabel={t(locale, 'people.joinClub.declaration.signHere')}
        value={signatureDataUrl}
        error={signatureError}
        onChange={onSignature}
        testId="join-declaration-signature"
      />

      {failed ? (
        <p
          className="text-[12.5px] text-red-600 font-medium"
          role="alert"
          data-testid="join-declaration-failed"
        >
          {t(locale, 'people.joinClub.declaration.failed')}
        </p>
      ) : null}
    </div>
  )
}
