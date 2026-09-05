// §5.8 -- the field rules, and the two gaps in the prototype that this closes.
//
// 1. THE SIGNATURE. The prototype styles the pad as required and calls
//    `getFieldError('signature')`, but no rule ever returns an error for it, so a
//    declaration submits unsigned.
// 2. THE ת.ז. The prototype counts digits. A transposed pair passes a digit count and is
//    somebody else's identifier -- `isValidNationalId` is the check that catches it, and it
//    already exists in this repo.
import { isValidNationalId } from '../../health/nationalId'
import { isMinor } from './types'
import type { FormPart, StudentDraft } from './types'

export const VALIDATION_COPY = {
  nameRequired: 'שדה חובה: נא להזין שם מלא של החניך/ה',
  nameTooShort: 'שם מלא חייב להכיל לפחות 2 אותיות',
  idRequired: 'שדה חובה: נא להזין מספר תעודת זהות',
  idInvalid: 'נא להזין תעודת זהות תקינה',
  birthRequired: 'שדה חובה: נא לבחור תאריך לידה',
  birthInvalid: 'תאריך לידה אינו תקין',
  addressRequired: 'שדה חובה: נא להזין כתובת',
  cityRequired: 'שדה חובה: נא להזין יישוב',
  gradeRequired: 'שדה חובה: נא לבחור כיתה או מסגרת לימודים',
  emailInvalid: 'כתובת דוא״ל אינה תקינה',
  guardianNameRequired: 'שדה חובה: נא להזין שם הורה / אפוטרופוס',
  guardianNameTooShort: 'שם ההורה חייב להכיל לפחות 2 אותיות',
  guardianIdRequired: 'שדה חובה: נא להזין תעודת זהות של ההורה',
  guardianIdInvalid: 'תעודת זהות הורה אינה תקינה',
  guardianPhoneRequired: 'שדה חובה: נא להזין מספר נייד של ההורה',
  phoneInvalid: 'מספר טלפון אינו תקין (לפחות 9 ספרות)',
  guardianEmailRequired: 'שדה חובה: נא להזין כתובת דוא״ל של ההורה',
  pickupNameRequired: 'שדה חובה: נא להזין שם מלווה מורשה',
  groupRequired: 'נא לבחור קבוצת אימון',
  planRequired: 'נא לבחור מסלול תשלום',
  healthPresetRequired: 'נא לסמן האם החניך כשיר לפעילות ספורטיבית או קיימת מגבלה',
  healthAnswersRequired: 'נא לסמן מענה "כן" או "לא" עבור כל שאלות הרקע הרפואי',
  healthFundRequired: 'שדה חובה: נא לבחור קופת חולים',
  emergencyRequired: 'שדה חובה: נא להזין מספר טלפון חירום נוסף',
  attestRequired: 'חובה לאשר את הצהרת הבריאות והתקנון להשלמת הרישום',
  signatureRequired: 'חובה לחתום כדי להשלים את רישום החניך',
  stepHasErrorsTitle: 'ישנם שדות חובה שלא מולאו כראוי בשלב זה',
  stepHasErrorsBody: 'אנא מלאו את השדות המסומנים במסגרת אדומה כדי להמשיך בתהליך הרישום.',
} as const

export type FieldKey =
  | 'firstName'
  | 'lastName'
  | 'nationalId'
  | 'birthDate'
  | 'address'
  | 'city'
  | 'email'
  | 'grade'
  | 'guardianFirstName'
  | 'guardianLastName'
  | 'guardianNationalId'
  | 'guardianPhone'
  | 'guardianEmail'
  | 'pickupExtraName'
  | 'groupId'
  | 'planId'
  | 'healthPreset'
  | 'healthAnswers'
  | 'healthFund'
  | 'emergencyPhone'
  | 'attested'
  | 'signature'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const digitsOf = (value: string) => value.replace(/\D/g, '')

export function fieldError(
  student: StudentDraft,
  field: FieldKey,
  templateQuestionIds: readonly string[] = [],
): string | null {
  const minor = isMinor(student.birthDate)

  switch (field) {
    case 'firstName':
    case 'lastName': {
      const value = field === 'firstName' ? student.firstName : student.lastName
      if (!value.trim()) return VALIDATION_COPY.nameRequired
      if (value.trim().length < 2) return VALIDATION_COPY.nameTooShort
      return null
    }
    case 'nationalId':
      if (!student.nationalId.trim()) return VALIDATION_COPY.idRequired
      return isValidNationalId(student.nationalId) ? null : VALIDATION_COPY.idInvalid
    case 'birthDate': {
      if (!student.birthDate) return VALIDATION_COPY.birthRequired
      const parsed = new Date(student.birthDate)
      if (Number.isNaN(parsed.getTime()) || parsed > new Date()) return VALIDATION_COPY.birthInvalid
      return null
    }
    // §5.2 -- required by `REQUIRED_REGISTRATION_FIELDS` on the server, and asked for
    // nowhere in the prototype. Without them every family completes four steps, signs, and
    // meets `RegistrationIncompleteError(["address", "city"])`.
    case 'address':
      return student.address.trim() ? null : VALIDATION_COPY.addressRequired
    case 'city':
      return student.city.trim() ? null : VALIDATION_COPY.cityRequired
    case 'email':
      if (!student.email.trim()) return null
      return EMAIL.test(student.email.trim()) ? null : VALIDATION_COPY.emailInvalid
    //: `REQUIRED_REGISTRATION_FIELDS_SELF` drops this: a school class is a fact about a
    //: school-age child and a grown adult has no answer for it.
    case 'grade':
      if (!minor) return null
      return student.grade ? null : VALIDATION_COPY.gradeRequired
    case 'guardianFirstName':
    case 'guardianLastName': {
      if (!minor) return null
      const value =
        field === 'guardianFirstName' ? student.guardianFirstName : student.guardianLastName
      if (!value.trim()) return VALIDATION_COPY.guardianNameRequired
      if (value.trim().length < 2) return VALIDATION_COPY.guardianNameTooShort
      return null
    }
    case 'guardianNationalId':
      if (!minor) return null
      if (!student.guardianNationalId.trim()) return VALIDATION_COPY.guardianIdRequired
      return isValidNationalId(student.guardianNationalId)
        ? null
        : VALIDATION_COPY.guardianIdInvalid
    case 'guardianPhone':
      if (!minor) return null
      if (!student.guardianPhone.trim()) return VALIDATION_COPY.guardianPhoneRequired
      return digitsOf(student.guardianPhone).length >= 9 ? null : VALIDATION_COPY.phoneInvalid
    case 'guardianEmail':
      if (!minor) return null
      if (!student.guardianEmail.trim()) return VALIDATION_COPY.guardianEmailRequired
      return EMAIL.test(student.guardianEmail.trim()) ? null : VALIDATION_COPY.emailInvalid
    case 'pickupExtraName':
      if (!minor || student.pickup.parentOnly) return null
      return student.pickup.extraName.trim() ? null : VALIDATION_COPY.pickupNameRequired
    case 'groupId':
      return student.groupId ? null : VALIDATION_COPY.groupRequired
    case 'planId':
      return student.planId ? null : VALIDATION_COPY.planRequired
    case 'healthPreset':
      return student.healthyPreset === null ? VALIDATION_COPY.healthPresetRequired : null
    case 'healthAnswers': {
      if (student.healthyPreset === null) return null
      const unanswered = templateQuestionIds.some(
        (id) => student.healthAnswers[id] === undefined || student.healthAnswers[id] === null,
      )
      return unanswered ? VALIDATION_COPY.healthAnswersRequired : null
    }
    case 'healthFund':
      return student.healthFund ? null : VALIDATION_COPY.healthFundRequired
    case 'emergencyPhone':
      if (!student.emergencyPhone.trim()) return VALIDATION_COPY.emergencyRequired
      return digitsOf(student.emergencyPhone).length >= 9 ? null : VALIDATION_COPY.phoneInvalid
    case 'attested':
      return student.attested ? null : VALIDATION_COPY.attestRequired
    //: The rule the prototype is missing entirely.
    case 'signature':
      return student.signatureDataUrl ? null : VALIDATION_COPY.signatureRequired
    default:
      return null
  }
}

export const FIELDS_BY_PART: Record<FormPart, readonly FieldKey[]> = {
  1: [
    'firstName',
    'lastName',
    'nationalId',
    'birthDate',
    'address',
    'city',
    'email',
    'grade',
    'guardianFirstName',
    'guardianLastName',
    'guardianNationalId',
    'guardianPhone',
    'guardianEmail',
    'pickupExtraName',
  ],
  2: ['groupId'],
  3: ['planId'],
  4: ['healthPreset', 'healthAnswers'],
  5: ['healthFund', 'emergencyPhone', 'attested', 'signature'],
}

export function partErrors(
  student: StudentDraft,
  part: FormPart,
  templateQuestionIds: readonly string[] = [],
): { field: FieldKey; message: string }[] {
  return FIELDS_BY_PART[part]
    .map((field) => ({ field, message: fieldError(student, field, templateQuestionIds) }))
    .filter((entry): entry is { field: FieldKey; message: string } => entry.message !== null)
}
