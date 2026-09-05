// The seam between the API's shapes and the wizard's.
//
// The wizard holds ids and values (`types.ts`); the API speaks its own vocabulary. Every
// conversion lives here so there is one place to look when a field goes missing between
// the form and the write -- the failure the repo's own verification note describes as "a
// field silently dropped in between passes every test".
import type { TemplateSchema } from '../../health/healthClient'
import type { PlanOption } from '../familyDraft'
import { isMinor, needsManagerReview } from './types'
import type { StudentDraft, WizardGroup, WizardPlan } from './types'

/** `OnboardingGroupOut` -- what `GET /public/onboarding/{token}` actually returns. */
export type ApiGroup = {
  id: string
  name: string
  class_name?: string | null
  weekdays: number[]
}

const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const

const SESSIONS_LABEL = (count: number) => `${count} אימונים בשבוע`

/** Degrades honestly. §10 asks the API for the schedule text, the coaches, the location
 *  and the session length; `OnboardingGroupOut` carries none of them yet, so the card
 *  shows what IS known -- the group's name, its class and the days it trains -- and the
 *  richer lines simply do not render rather than showing invented values. */
export function toWizardGroup(group: ApiGroup): WizardGroup {
  const days = [...group.weekdays].sort((a, b) => a - b)
  return {
    id: group.id,
    name: group.name,
    trackLabel: days.length > 0 ? SESSIONS_LABEL(days.length) : '',
    durationMin: 0,
    scheduleLabel: days.map((day) => WEEKDAY_NAMES[day] ?? '').filter(Boolean).join(' · '),
    coachesLabel: '',
    locationLabel: group.class_name ?? '',
  }
}

export function toWizardPlan(plan: PlanOption): WizardPlan {
  return {
    id: plan.id,
    title: plan.name,
    subtitle: plan.sessionsPerWeek ? SESSIONS_LABEL(plan.sessionsPerWeek) : '',
    pricePerMonthAgorot: plan.monthlyAmountAgorot,
    features: [],
  }
}

export type RegisterPayload = {
  first_name: string
  last_name: string
  phone: string | null
  signer: {
    national_id: string
    address: string
    city: string
    phone_home: string | null
    aliyah_year: string | null
    relation: 'mother' | 'father' | 'other'
  }
  club_terms_accepted: boolean
  children: {
    first_name: string
    last_name: string
    birthdate: string | null
    group_ids: string[]
    self_student: boolean
    national_id: string | null
    grade: string | null
    price_plan_id: string | null
    other_parent: null
    pickup_contacts: { name: string; phone: string }[]
    health: {
      template_id: string
      answers: Record<string, unknown>
      signature_image_base64: string
    } | null
  }[]
}

/** One transaction's worth of family, built from the wizard's state at step 3's final
 *  button and nowhere else (decision B2). */
export function toRegisterPayload(
  students: readonly StudentDraft[],
  options: { templateId: string | null; clubTermsAccepted: boolean },
): RegisterPayload {
  const first = students[0]
  if (!first) throw new Error('a registration needs at least one student')

  //: The GUARDIAN is the account holder, and the API carries one signer for the whole
  //: submission. The wizard asks for the guardian on each child's own panel and seeds
  //: every later child from the first, so these are the same values the family typed
  //: once -- but the shape is one signer, and a family whose children genuinely live at
  //: two addresses cannot be expressed until `OnboardingSignerIn` grows a per-child one.
  const signerSource = students.find((student) => isMinor(student.birthDate)) ?? first

  return {
    first_name: signerSource.guardianFirstName || signerSource.firstName,
    last_name: signerSource.guardianLastName || signerSource.lastName,
    phone: signerSource.guardianPhone || null,
    signer: {
      national_id: signerSource.guardianNationalId || signerSource.nationalId,
      address: signerSource.address,
      city: signerSource.city,
      phone_home: null,
      aliyah_year: null,
      relation: 'mother',
    },
    club_terms_accepted: options.clubTermsAccepted,
    children: students.map((student) => {
      const minor = isMinor(student.birthDate)
      return {
        first_name: student.firstName,
        last_name: student.lastName,
        birthdate: student.birthDate || null,
        //: One base group per child (§5.3), sent as the list the API takes.
        group_ids: student.groupId ? [student.groupId] : [],
        //: §5.3's adult member -- one human in both roles.
        self_student: !minor,
        national_id: student.nationalId || null,
        //: `REQUIRED_REGISTRATION_FIELDS_SELF` drops the school class for an adult, and
        //: the form does not ask them for one.
        grade: minor ? student.grade || null : null,
        price_plan_id: student.planId || null,
        other_parent: null,
        pickup_contacts:
          minor && !student.pickup.parentOnly && student.pickup.extraName
            ? [{ name: student.pickup.extraName, phone: student.pickup.extraPhone }]
            : [],
        health: options.templateId
          ? {
              template_id: options.templateId,
              answers: {
                ...student.healthAnswers,
                health_fund: student.healthFund,
                emergency_contact: student.emergencyPhone,
                special_notes: student.medicalNotes,
              },
              //: The pad stores a data URL; the API takes the base64 payload alone.
              signature_image_base64: student.signatureDataUrl.replace(
                /^data:image\/\w+;base64,/,
                '',
              ),
            }
          : null,
      }
    }),
  }
}

/** Who the payment screen may charge. A child awaiting review is not one of them. */
export function chargeableStudents(students: readonly StudentDraft[]): StudentDraft[] {
  return students.filter((student) => !needsManagerReview(student))
}

export type WizardData = {
  studioName: string
  logoUrl: string | null
  groups: WizardGroup[]
  plans: WizardPlan[]
  healthSchema: TemplateSchema | null
  templateId: string | null
}
