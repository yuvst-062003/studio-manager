// §5.2 -- part 1. Student, then guardian when the student is a minor.
//
// **Every field starts empty.** The prototype pre-fills a guardian named יוסף לוי with ת.ז.
// 028194857, a phone, an email, an emergency number and a birthdate -- all valid-looking,
// all accepted by its own validation. A distracted family submits a stranger's identity as
// their own and the club's records are quietly wrong (§14.1).
import { School, User, Users } from 'lucide-react'
import { SectionBand, SelectField, TextField } from './Field'
import { GRADE_OPTIONS, BELT_OPTIONS, STUDENT_FORM_COPY } from '../content'
import { ageFrom, isMinor } from '../types'
import type { StudentDraft } from '../types'
import type { FieldKey } from '../validation'

export type PartProps = {
  student: StudentDraft
  onChange: (patch: Partial<StudentDraft>) => void
  errorFor: (field: FieldKey) => string | null
  onBlurField: (field: FieldKey) => void
}

export function PartDetails({ student, onChange, errorFor, onBlurField }: PartProps) {
  const minor = isMinor(student.birthDate)
  const age = ageFrom(student.birthDate)
  const copy = STUDENT_FORM_COPY

  return (
    <div className="flex flex-col gap-3.5">
      <SectionBand icon={<User className="w-5 h-5" />} title={copy.studentSection} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField
          label={copy.firstName}
          required
          value={student.firstName}
          placeholder={copy.firstNamePlaceholder}
          error={errorFor('firstName')}
          onChange={(event) => onChange({ firstName: event.target.value })}
          onBlur={() => onBlurField('firstName')}
        />
        <TextField
          label={copy.lastName}
          required
          value={student.lastName}
          error={errorFor('lastName')}
          onChange={(event) => onChange({ lastName: event.target.value })}
          onBlur={() => onBlurField('lastName')}
        />
        <TextField
          label={copy.nationalId}
          required
          dir="ltr"
          inputMode="numeric"
          value={student.nationalId}
          placeholder={copy.nationalIdPlaceholder}
          error={errorFor('nationalId')}
          onChange={(event) => onChange({ nationalId: event.target.value })}
          onBlur={() => onBlurField('nationalId')}
        />
        <div className="flex flex-col gap-1">
          <TextField
            label={copy.birthDate}
            required
            type="date"
            value={student.birthDate}
            error={errorFor('birthDate')}
            onChange={(event) => onChange({ birthDate: event.target.value })}
            onBlur={() => onBlurField('birthDate')}
          />
          {Number.isFinite(age) ? (
            <span className="self-start px-2 py-0.5 rounded-md bg-[#d9e2ff] text-[#001945] text-[11px] font-semibold">
              {copy.ageBadge}: {age} ({minor ? copy.ageMinor : copy.ageAdult})
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Asked only of a minor. `REQUIRED_REGISTRATION_FIELDS_SELF` drops it, and the
            prototype's `בוגרים` option stores a non-answer as though it were one. */}
        {minor ? (
          <SelectField
            label={copy.grade}
            required
            value={student.grade}
            placeholder={copy.gradePlaceholder}
            options={GRADE_OPTIONS}
            error={errorFor('grade')}
            onChange={(event) => onChange({ grade: event.target.value as StudentDraft['grade'] })}
            onBlur={() => onBlurField('grade')}
          />
        ) : null}
        <SelectField
          label={copy.belt}
          value={student.beltId}
          placeholder={copy.beltPlaceholder}
          options={BELT_OPTIONS}
          error={null}
          onChange={(event) => onChange({ beltId: event.target.value })}
        />
        {/* §10 — an ACCESS field, not a contact one: it is how an adult member or an older
            child signs in as themselves. Optional, because a young child has no address. */}
        <TextField
          label={copy.studentEmail}
          type="email"
          dir="ltr"
          value={student.email}
          placeholder={copy.emailPlaceholder}
          error={errorFor('email')}
          onChange={(event) => onChange({ email: event.target.value })}
          onBlur={() => onBlurField('email')}
        />
      </div>

      {/* §5.2 — required by the server, absent from the prototype's form entirely. On the
          student and not the family, so separated parents can register children at two
          addresses. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <TextField
          label={copy.address}
          required
          value={student.address}
          placeholder={copy.addressPlaceholder}
          error={errorFor('address')}
          onChange={(event) => onChange({ address: event.target.value })}
          onBlur={() => onBlurField('address')}
        />
        <TextField
          label={copy.city}
          required
          value={student.city}
          placeholder={copy.cityPlaceholder}
          error={errorFor('city')}
          onChange={(event) => onChange({ city: event.target.value })}
          onBlur={() => onBlurField('city')}
        />
      </div>

      {student.birthDate && !minor ? (
        <div className="p-3 rounded-xl bg-[#f2f3ff] border border-[#e9edff] text-[#001849] text-[12px] flex items-center justify-between">
          <span className="font-semibold">{copy.adultNotice}</span>
          <span className="text-[#0056c5] font-bold">18+</span>
        </div>
      ) : null}

      {minor ? (
        <>
          <SectionBand icon={<Users className="w-5 h-5" />} title={copy.guardianSection} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextField
              label={copy.guardianFirstName}
              required
              value={student.guardianFirstName}
              error={errorFor('guardianFirstName')}
              onChange={(event) => onChange({ guardianFirstName: event.target.value })}
              onBlur={() => onBlurField('guardianFirstName')}
            />
            <TextField
              label={copy.guardianLastName}
              required
              value={student.guardianLastName}
              error={errorFor('guardianLastName')}
              onChange={(event) => onChange({ guardianLastName: event.target.value })}
              onBlur={() => onBlurField('guardianLastName')}
            />
            <TextField
              label={copy.guardianNationalId}
              required
              dir="ltr"
              inputMode="numeric"
              value={student.guardianNationalId}
              placeholder={copy.nationalIdPlaceholder}
              error={errorFor('guardianNationalId')}
              onChange={(event) => onChange({ guardianNationalId: event.target.value })}
              onBlur={() => onBlurField('guardianNationalId')}
            />
            <TextField
              label={copy.guardianPhone}
              required
              type="tel"
              dir="ltr"
              value={student.guardianPhone}
              placeholder={copy.phonePlaceholder}
              error={errorFor('guardianPhone')}
              onChange={(event) => onChange({ guardianPhone: event.target.value })}
              onBlur={() => onBlurField('guardianPhone')}
            />
          </div>
          <TextField
            label={copy.guardianEmail}
            required
            type="email"
            dir="ltr"
            value={student.guardianEmail}
            placeholder={copy.emailPlaceholder}
            error={errorFor('guardianEmail')}
            onChange={(event) => onChange({ guardianEmail: event.target.value })}
            onBlur={() => onBlurField('guardianEmail')}
          />

          <div className="p-3.5 rounded-xl bg-[#f2f3ff] border border-[#e9edff] flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <School className="w-5 h-5 text-[#0056c5] shrink-0" />
                <span className="text-[13px] font-bold text-[#001849]">{copy.pickupTitle}</span>
              </div>
              <label className="flex items-center gap-2 cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={student.pickup.parentOnly}
                  onChange={(event) =>
                    onChange({ pickup: { ...student.pickup, parentOnly: event.target.checked } })
                  }
                  className="w-5 h-5 accent-[#0056c5]"
                />
                <span className="text-[12px] font-medium text-[#161b28]">{copy.pickupParentOnly}</span>
              </label>
            </div>

            {!student.pickup.parentOnly ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <TextField
                  label={copy.pickupName}
                  required
                  value={student.pickup.extraName}
                  placeholder={copy.pickupNamePlaceholder}
                  error={errorFor('pickupExtraName')}
                  onChange={(event) =>
                    onChange({ pickup: { ...student.pickup, extraName: event.target.value } })
                  }
                  onBlur={() => onBlurField('pickupExtraName')}
                />
                <TextField
                  label={copy.pickupPhone}
                  type="tel"
                  dir="ltr"
                  value={student.pickup.extraPhone}
                  placeholder={copy.phonePlaceholder}
                  error={null}
                  onChange={(event) =>
                    onChange({ pickup: { ...student.pickup, extraPhone: event.target.value } })
                  }
                />
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
