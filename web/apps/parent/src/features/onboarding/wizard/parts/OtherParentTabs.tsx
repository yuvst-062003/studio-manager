// הורה 1 / הורה 2 — the second parent, behind a tab (owner decision, 2026-09-06).
//
// **A tab and not a second section.** Most families here have one parent filling this in,
// and a permanently visible empty block of four fields reads as unfinished work: a family
// that leaves it blank is left wondering whether they were allowed to. One tab is the whole
// form for them; the second appears only for a family that asks for it.
//
// **Two, and the control to add the second disappears once it exists.** The API carries
// exactly one `other_parent` per child, so a third tab would have nowhere to go — the cap
// is the wire format's, not a product opinion, and enforcing it here means the form cannot
// collect something the write would silently drop.
//
// **Removing clears the fields rather than hiding them.** A parent who adds a second
// parent, types a name, changes their mind and removes the tab means it: leaving the values
// in state to be submitted invisibly is how a stranger's name ends up on a registration.
//
// **Minors only.** `PartDetails` renders this inside its own `minor` branch — nobody else's
// name belongs on an adult member's own registration, which is the same rule
// `OnboardingService._apply_family_details` enforces on the server for a self-guarding
// child regardless of what was sent.
import { Users, X } from 'lucide-react'
import { TextField } from './Field'
import type { studentFormCopy } from '../copy'
import type { OtherParentDraft, StudentDraft } from '../types'
import type { FieldKey } from '../validation'

const EMPTY: OtherParentDraft = { firstName: '', lastName: '', nationalId: '', phone: '' }

export function OtherParentTabs({
  copy,
  student,
  onChange,
  errorFor,
  onBlurField,
}: {
  //: The real shape, not `Record<string, string>` — indexing that returns
  //: `string | undefined` under `noUncheckedIndexedAccess`, and a label that can be
  //: undefined is a field with no name.
  copy: ReturnType<typeof studentFormCopy>
  student: StudentDraft
  onChange: (patch: Partial<StudentDraft>) => void
  errorFor: (field: FieldKey) => string | null
  onBlurField: (field: FieldKey) => void
}) {
  const second = student.otherParent
  const patch = (values: Partial<OtherParentDraft>) =>
    onChange({ otherParent: { ...(second ?? EMPTY), ...values } })

  return (
    <div className="rounded-xl border border-[var(--wz-tint)] bg-[var(--wz-surface)] p-3 flex flex-col gap-3">
      {/* `role="tablist"` is deliberately NOT used: these are not tabs over one panel, they
          are one panel plus a control that creates a second. Announcing them as tabs would
          promise arrow-key navigation between two things when only one of them exists. */}
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-[var(--wz-accent)] shrink-0" aria-hidden="true" />
        <span className="text-[13px] font-bold text-[var(--wz-heading)]">{copy.parentTab1}</span>
        {second ? (
          <>
            <span aria-hidden="true" className="text-[var(--wz-tertiary)]">
              ·
            </span>
            <span className="text-[13px] font-bold text-[var(--wz-heading)]">{copy.parentTab2}</span>
            <button
              type="button"
              data-testid="other-parent-remove"
              aria-label={copy.parentTabRemove}
              onClick={() => onChange({ otherParent: null })}
              className="ms-auto flex items-center gap-1 text-[12px] font-bold text-[var(--wz-accent)] cursor-pointer"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{copy.parentTabRemove}</span>
            </button>
          </>
        ) : (
          <button
            type="button"
            data-testid="other-parent-add"
            onClick={() => onChange({ otherParent: { ...EMPTY } })}
            className="ms-auto text-[12px] font-bold text-[var(--wz-accent)] cursor-pointer"
          >
            + {copy.parentTabAdd}
          </button>
        )}
      </div>

      {second ? (
        <div data-testid="other-parent-fields" className="flex flex-col gap-3">
          <p className="text-[11px] text-[var(--wz-tertiary)]">{copy.otherParentOptional}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              label={copy.otherParentFirstName}
              value={second.firstName}
              error={null}
              onChange={(event) => patch({ firstName: event.target.value })}
            />
            <TextField
              label={copy.otherParentLastName}
              value={second.lastName}
              error={null}
              onChange={(event) => patch({ lastName: event.target.value })}
            />
            {/* Optional, but checked when filled: a mistyped ת.ז. is one the club can never
                match to a person, and finding that out later costs a phone call. */}
            <TextField
              label={copy.otherParentNationalId}
              dir="ltr"
              inputMode="numeric"
              value={second.nationalId}
              placeholder={copy.nationalIdPlaceholder}
              error={errorFor('otherParentNationalId')}
              onChange={(event) => patch({ nationalId: event.target.value })}
              onBlur={() => onBlurField('otherParentNationalId')}
            />
            <TextField
              label={copy.otherParentPhone}
              type="tel"
              dir="ltr"
              value={second.phone}
              placeholder={copy.phonePlaceholder}
              error={errorFor('otherParentPhone')}
              onChange={(event) => patch({ phone: event.target.value })}
              onBlur={() => onBlurField('otherParentPhone')}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
