// §5.8 -- the field rules, and the two gaps in the prototype that this closes.
//
// 1. THE SIGNATURE. The prototype styles the pad as required and calls
//    `getFieldError('signature')`, but no rule ever returns an error for it, so a
//    declaration submits unsigned.
// 2. THE ת.ז. The prototype counts digits. A transposed pair passes a digit count and is
//    somebody else's identifier -- `isValidNationalId` is the check that catches it, and it
//    already exists in this repo.
import { isValidNationalId } from '../../health/nationalId'
import { CLAUSE_QUESTION_ID } from '../../health/clauses'
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
  phoneRequired: 'שדה חובה: נא להזין מספר נייד',
  phoneInvalid: 'מספר טלפון אינו תקין (לפחות 9 ספרות)',
  guardianEmailRequired: 'שדה חובה: נא להזין כתובת דוא״ל של ההורה',
  pickupNameRequired: 'שדה חובה: נא להזין שם מלווה מורשה',
  groupRequired: 'נא לבחור קבוצת אימון',
  planRequired: 'נא לבחור מסלול תשלום',
  healthPresetRequired: 'נא לסמן האם החניך כשיר לפעילות ספורטיבית או קיימת מגבלה',
  healthAnswersRequired: 'נא לסמן מענה "כן" או "לא" עבור כל שאלות הרקע הרפואי',
  //: Its own message, not the one above. A family who answered every question and simply
  //: did not tick the declaration would otherwise be told to answer the questions again.
  healthClauseRequired: 'נא לאשר את ההצהרה כדי להמשיך',
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
  | 'phone'
  | 'guardianFirstName'
  | 'guardianLastName'
  | 'guardianNationalId'
  | 'guardianPhone'
  | 'guardianEmail'
  | 'otherParentNationalId'
  | 'otherParentPhone'
  | 'pickupExtraName'
  | 'groupId'
  | 'planId'
  | 'healthPreset'
  | 'healthAnswers'
  | 'healthClause'
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
    //: Bug #28 — the ADULT's own mobile, mirroring `guardianPhone` below exactly: asked of
    //: whoever the account holder is, required of them, and not asked at all of the other.
    //: A minor is reached through their guardian; asking a child for a number as well
    //: would collect one nobody rings.
    case 'phone':
      if (minor) return null
      if (!student.phone.trim()) return VALIDATION_COPY.phoneRequired
      return digitsOf(student.phone).length >= 9 ? null : VALIDATION_COPY.phoneInvalid
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
    // הורה 2 is optional whole, so an ABSENT second parent is valid and an absent FIELD is
    // valid. What is not valid is a ת.ז. or a phone typed WRONG: an optional field still has
    // to be right when it is filled, and a mistyped second-parent ת.ז. is one the club can
    // never match to a person.
    case 'otherParentNationalId': {
      const value = student.otherParent?.nationalId.trim() ?? ''
      if (!value) return null
      return isValidNationalId(value) ? null : VALIDATION_COPY.idInvalid
    }
    case 'otherParentPhone': {
      const value = student.otherParent?.phone.trim() ?? ''
      if (!value) return null
      return digitsOf(value).length >= 9 ? null : VALIDATION_COPY.phoneInvalid
    }
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
        (id) =>
          //: The clause has its own rule below -- it is derived rather than answered, and
          //: it needs its own message.
          id !== CLAUSE_QUESTION_ID &&
          (student.healthAnswers[id] === undefined || student.healthAnswers[id] === null),
      )
      return unanswered ? VALIDATION_COPY.healthAnswersRequired : null
    }
    //: The declaration itself. Required only when the template HAS a clause question --
    //: v1 and the trial form have none, and the caller's id list is what says so, the same
    //: shape the server's own check uses. `''` is what an unticked box holds, and it is not
    //: an answer: without this the wizard let a family through step 4 and the whole
    //: registration was then refused at the final button with
    //: `answers_incomplete: clause_confirmed`.
    case 'healthClause': {
      if (student.healthyPreset === null) return null
      if (!templateQuestionIds.includes(CLAUSE_QUESTION_ID)) return null
      return student.healthAnswers[CLAUSE_QUESTION_ID]
        ? null
        : VALIDATION_COPY.healthClauseRequired
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
    'phone',
    'grade',
    'guardianFirstName',
    'guardianLastName',
    'guardianNationalId',
    'guardianPhone',
    'guardianEmail',
    'otherParentNationalId',
    'otherParentPhone',
    'pickupExtraName',
  ],
  2: ['groupId'],
  3: ['planId'],
  4: ['healthPreset', 'healthAnswers', 'healthClause'],
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
