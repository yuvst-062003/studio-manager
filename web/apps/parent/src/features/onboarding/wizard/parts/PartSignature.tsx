// §5.6 -- part 5. Emergency contact, health fund, the legal attestation and the signature.
//
// Three departures from the prototype, all of them §14.1:
//   * the attestation checkbox starts UNTICKED -- a pre-ticked consent box is not consent,
//     and `ConsentRecord` models an explicit grant
//   * the signature is REQUIRED, which no rule in the prototype enforces
//   * the pad shows a prompt, not the signer's name pre-rendered in cursive; an unsigned
//     pad that looks signed is worse than a blank one
import { AlertCircle, Shield } from 'lucide-react'
import type { Locale } from '@studio/i18n'
import { SignatureField } from './SignatureField'
import { SelectField, TextField } from './Field'
import { healthFundOptions, studentFormCopy } from '../copy'
import { isMinor } from '../types'
import type { StudentDraft } from '../types'
import type { FieldKey } from '../validation'

export function PartSignature({
  locale,
  student,
  onChange,
  errorFor,
  onBlurField,
}: {
  locale: Locale
  student: StudentDraft
  onChange: (patch: Partial<StudentDraft>) => void
  errorFor: (field: FieldKey) => string | null
  onBlurField: (field: FieldKey) => void
}) {
  const copy = studentFormCopy(locale)
  const HEALTH_FUND_OPTIONS = healthFundOptions(locale)
  const signatureError = errorFor('signature')

  const signerLabel = isMinor(student.birthDate) ? copy.signGuardian : copy.signAdult

  return (
    <div className="flex flex-col gap-3.5">
      <div className="p-3 rounded-xl bg-[var(--wz-raised)] border border-[var(--wz-tint)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-[var(--wz-accent)]" />
          <span className="text-[15px] font-bold text-[var(--wz-heading)]">{copy.emergencyTitle}</span>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-[var(--wz-tint-2)] text-[var(--wz-heading)] text-[11px] font-bold">
          {copy.finalStep}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField
          label={copy.emergencyPhone}
          required
          type="tel"
          dir="ltr"
          value={student.emergencyPhone}
          placeholder={copy.phonePlaceholder}
          error={errorFor('emergencyPhone')}
          onChange={(event) => onChange({ emergencyPhone: event.target.value })}
          onBlur={() => onBlurField('emergencyPhone')}
        />
        <SelectField
          label={copy.healthFund}
          required
          value={student.healthFund}
          placeholder={copy.healthFundPlaceholder}
          options={HEALTH_FUND_OPTIONS}
          error={errorFor('healthFund')}
          onChange={(event) =>
            onChange({ healthFund: event.target.value as StudentDraft['healthFund'] })
          }
          onBlur={() => onBlurField('healthFund')}
        />
      </div>
      <p className="text-[11px] text-[var(--wz-tertiary)] -mt-2">{copy.emergencyHint}</p>

      <div
        className={`p-3.5 rounded-xl transition-all border flex flex-col gap-2.5 ${
          errorFor('attested') ? 'bg-red-50/40 border-2 border-red-400' : 'bg-[var(--wz-raised)] border-[var(--wz-tint)]'
        }`}
      >
        <span className="text-[13px] font-bold text-[var(--wz-heading)] flex items-center gap-1.5">
          <Shield className="w-4 h-4 text-[var(--wz-accent)]" />
          {copy.attestTitle}
        </span>
        <p className="text-[12px] text-[var(--wz-secondary)] leading-relaxed">{copy.attestBody}</p>
        <label
          className={`flex items-start gap-2.5 p-2 rounded-lg cursor-pointer transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--wz-accent)] ${
            errorFor('attested')
              ? 'bg-[var(--wz-surface)] border-2 border-red-400 text-red-900'
              : 'bg-[var(--wz-surface)] border border-[var(--wz-line-strong)]/60'
          }`}
        >
          <input
            type="checkbox"
            checked={student.attested}
            onChange={(event) => {
              onChange({ attested: event.target.checked })
              onBlurField('attested')
            }}
            className="w-5 h-5 mt-0.5 accent-[var(--wz-accent)]"
          />
          <span className="text-[12px] text-[var(--wz-ink)] font-medium">
            {copy.attestCheckbox} <span className="text-red-500 font-bold">*</span>
          </span>
        </label>
        {errorFor('attested') ? (
          <p className="text-[11.5px] text-red-600 font-medium flex items-center gap-1" role="alert">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorFor('attested')}</span>
          </p>
        ) : null}
      </div>

      <SignatureField
        label={signerLabel}
        clearLabel={copy.clearSignature}
        promptLabel={copy.signHere}
        value={student.signatureDataUrl}
        error={signatureError}
        onChange={(signatureDataUrl) => onChange({ signatureDataUrl })}
      />
    </div>
  )
}
