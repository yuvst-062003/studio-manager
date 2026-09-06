// Task 6 -- the wizard's copy, read from the shared `people` namespace instead of held here
// as a literal object. This module replaces `content.ts`: every string that used to live in
// a `*_COPY` object, `LEGAL_DOCS` or `FAQ_ITEMS` now has a `joinWizard.<screen>.<key>` entry
// in `packages/i18n/{he,en,ru}/people.ts`, and the functions below are the one place that
// reads them back out for a given `locale`.
//
// **The key names are exactly the old object's own keys.** `STEP3_COPY.methodCredit` became
// `people.joinWizard.step3.methodCredit` — nothing was renamed, so a reviewer can diff the
// two lists by eye. Values moved verbatim from `content.ts` (Hebrew) with English and
// Russian added beside them; see the i18n files' own history for that.
//
// `LEGAL_DOCS` and `FAQ_ITEMS` were nested data, which the flat `Bundle` type (`Record<
// string, string>`) cannot hold directly, so their structure -- which document has how many
// sections, which FAQ ids exist -- stays here as plain constants (not translated: adding an
// eighth `terms` section is a content change, not a translation), and `legalDocs`/`faqItems`
// below rebuild the same shapes `Step1Agreements`/`WizardPopup` already expect by calling
// `t()` once per leaf.
import { t } from '@studio/i18n'
import type { Locale } from '@studio/i18n'
// P8's offline distinction, shared with the four redesigned tabs. "We could not load the
// club" and "you have no signal" are different messages and only one of them is the club's
// fault -- a family standing in a dojo doorway on a join link was being told the club was
// broken. `features/shell/loadFailed.ts` carries the reasoning.
import { resolveLoadFailedText } from '../../shell/loadFailed'

export type DocumentKey = 'terms' | 'privacy' | 'payments'

export type LegalDocument =
  | { title: string; sections: readonly { heading: string; body: string }[] }
  | { title: string; paragraphs: readonly string[] }

export type FaqItem = {
  readonly id: string
  readonly category: string
  readonly question: string
  readonly answer: string
}

// Structural only -- how many sections each document has, and which ids the FAQ has. NOT
// translated content: these counts describe the document's shape, and hold steady across
// all three locales the same way the document TITLES' order does.
const TERMS_SECTION_COUNT = 8
const PRIVACY_SECTION_COUNT = 12
const PAYMENTS_PARAGRAPH_COUNT = 3

const FAQ_IDS = [
  'first-class-equipment',
  'parent-attendance',
  'safety-and-protection',
  'missed-sessions',
  'trial-period',
] as const

function legalSections(locale: Locale, doc: 'terms' | 'privacy', count: number) {
  return Array.from({ length: count }, (_, index) => ({
    heading: t(locale, `people.joinWizard.legal.${doc}.sections.${index}.heading`),
    body: t(locale, `people.joinWizard.legal.${doc}.sections.${index}.body`),
  }))
}

export function legalDocs(locale: Locale): Record<DocumentKey, LegalDocument> {
  return {
    terms: {
      title: t(locale, 'people.joinWizard.legal.terms.title'),
      sections: legalSections(locale, 'terms', TERMS_SECTION_COUNT),
    },
    privacy: {
      title: t(locale, 'people.joinWizard.legal.privacy.title'),
      sections: legalSections(locale, 'privacy', PRIVACY_SECTION_COUNT),
    },
    payments: {
      title: t(locale, 'people.joinWizard.legal.payments.title'),
      paragraphs: Array.from({ length: PAYMENTS_PARAGRAPH_COUNT }, (_, index) =>
        t(locale, `people.joinWizard.legal.payments.paragraphs.${index}`),
      ),
    },
  }
}

export function faqItems(locale: Locale): readonly FaqItem[] {
  return FAQ_IDS.map((id) => ({
    id,
    category: t(locale, `people.joinWizard.faq.${id}.category`),
    question: t(locale, `people.joinWizard.faq.${id}.question`),
    answer: t(locale, `people.joinWizard.faq.${id}.answer`),
  }))
}

// -- option lists (GRADE_OPTIONS, BELT_OPTIONS, HEALTH_FUND_OPTIONS) -----------------------
//
// The `value` half is a stored id (`StudentDraft.grade`, `.beltId`, `.healthFund`) and stays
// fixed across locales; only the `label` half is translated.

const GRADE_KEYS = [
  'kindergarten',
  'grade_1',
  'grade_2',
  'grade_3',
  'grade_4',
  'grade_5',
  'grade_6',
  'grade_7',
  'grade_8',
  'grade_9',
  'highschool',
] as const

const BELT_KEYS = [
  'white',
  'white_yellow',
  'yellow',
  'orange',
  'green',
  'blue',
  'brown',
  'black',
] as const

const HEALTH_FUND_KEYS = ['clalit', 'maccabi', 'meuhedet', 'leumit'] as const

export function gradeOptions(locale: Locale) {
  return GRADE_KEYS.map((value) => ({
    value,
    label: t(locale, `people.joinWizard.options.grade.${value}`),
  }))
}

export function beltOptions(locale: Locale) {
  return BELT_KEYS.map((value) => ({
    value,
    label: t(locale, `people.joinWizard.options.belt.${value}`),
  }))
}

export function healthFundOptions(locale: Locale) {
  return HEALTH_FUND_KEYS.map((value) => ({
    value,
    label: t(locale, `people.joinWizard.options.healthFund.${value}`),
  }))
}

// -- the eight `*_COPY` objects, one function each ------------------------------------------
//
// Generated mechanically from `content.ts`'s own key order (every key below is copy-pasted
// from the object it replaces, not retyped) so a missing or misspelled key would show up as
// a diff against that list, not just at runtime.

export function step1Copy(locale: Locale) {
  return {
    seasonBadge: t(locale, 'people.joinWizard.step1.seasonBadge'),
    heading: t(locale, 'people.joinWizard.step1.heading'),
    lead: t(locale, 'people.joinWizard.step1.lead'),
    viewDocument: t(locale, 'people.joinWizard.step1.viewDocument'),
    completedLabel: t(locale, 'people.joinWizard.step1.completedLabel'),
    faqTitle: t(locale, 'people.joinWizard.step1.faqTitle'),
    faqLead: t(locale, 'people.joinWizard.step1.faqLead'),
    faqCount: t(locale, 'people.joinWizard.step1.faqCount'),
    agree: t(locale, 'people.joinWizard.step1.agree'),
    continue: t(locale, 'people.joinWizard.step1.continue'),
    closeDocument: t(locale, 'people.joinWizard.step1.closeDocument'),
    close: t(locale, 'people.joinWizard.step1.close'),
    //: Gap 2 -- rendered as `{label} {n}`, the way the wizard renders its other counts.
    //: Never interpolated in the locale file itself.
    termsVersion: t(locale, 'people.joinWizard.step1.termsVersion'),
  } as const
}

export function step2Copy(locale: Locale) {
  return {
    seasonPill: t(locale, 'people.joinWizard.step2.seasonPill'),
    heading: t(locale, 'people.joinWizard.step2.heading'),
    lead: t(locale, 'people.joinWizard.step2.lead'),
    registered: t(locale, 'people.joinWizard.step2.registered'),
    nationalIdShort: t(locale, 'people.joinWizard.step2.nationalIdShort'),
    readyForNext: t(locale, 'people.joinWizard.step2.readyForNext'),
    minor: t(locale, 'people.joinWizard.step2.minor'),
    adult: t(locale, 'people.joinWizard.step2.adult'),
    age: t(locale, 'people.joinWizard.step2.age'),
    awaitingReview: t(locale, 'people.joinWizard.step2.awaitingReview'),
    awaitingReviewNote: t(locale, 'people.joinWizard.step2.awaitingReviewNote'),
    guardian: t(locale, 'people.joinWizard.step2.guardian'),
    pickup: t(locale, 'people.joinWizard.step2.pickup'),
    pickupParentsOnly: t(locale, 'people.joinWizard.step2.pickupParentsOnly'),
    adultRow: t(locale, 'people.joinWizard.step2.adultRow'),
    edit: t(locale, 'people.joinWizard.step2.edit'),
    remove: t(locale, 'people.joinWizard.step2.remove'),
    cannotRemoveLast: t(locale, 'people.joinWizard.step2.cannotRemoveLast'),
    draftTitle: t(locale, 'people.joinWizard.step2.draftTitle'),
    draftResume: t(locale, 'people.joinWizard.step2.draftResume'),
    draftDiscard: t(locale, 'people.joinWizard.step2.draftDiscard'),
    addStudent: t(locale, 'people.joinWizard.step2.addStudent'),
    tryFirst: t(locale, 'people.joinWizard.step2.tryFirst'),
    continueDraft: t(locale, 'people.joinWizard.step2.continueDraft'),
    back: t(locale, 'people.joinWizard.step2.back'),
    continueToStep3: t(locale, 'people.joinWizard.step2.continueToStep3'),
    noStudentsYet: t(locale, 'people.joinWizard.step2.noStudentsYet'),
  } as const
}

export function studentFormCopy(locale: Locale) {
  return {
    addTitle: t(locale, 'people.joinWizard.form.addTitle'),
    editTitle: t(locale, 'people.joinWizard.form.editTitle'),
    cancel: t(locale, 'people.joinWizard.form.cancel'),
    previous: t(locale, 'people.joinWizard.form.previous'),
    close: t(locale, 'people.joinWizard.form.close'),
    autosaved: t(locale, 'people.joinWizard.form.autosaved'),
    autosavedShort: t(locale, 'people.joinWizard.form.autosavedShort'),
    resetDraft: t(locale, 'people.joinWizard.form.resetDraft'),
    tab1: t(locale, 'people.joinWizard.form.tab1'),
    tab2: t(locale, 'people.joinWizard.form.tab2'),
    tab3: t(locale, 'people.joinWizard.form.tab3'),
    tab4: t(locale, 'people.joinWizard.form.tab4'),
    tab5: t(locale, 'people.joinWizard.form.tab5'),
    part1Title: t(locale, 'people.joinWizard.form.part1Title'),
    part2Title: t(locale, 'people.joinWizard.form.part2Title'),
    part3Title: t(locale, 'people.joinWizard.form.part3Title'),
    part4Title: t(locale, 'people.joinWizard.form.part4Title'),
    part5Title: t(locale, 'people.joinWizard.form.part5Title'),
    next1: t(locale, 'people.joinWizard.form.next1'),
    next2: t(locale, 'people.joinWizard.form.next2'),
    next3: t(locale, 'people.joinWizard.form.next3'),
    next4: t(locale, 'people.joinWizard.form.next4'),
    save: t(locale, 'people.joinWizard.form.save'),
    studentSection: t(locale, 'people.joinWizard.form.studentSection'),
    guardianSection: t(locale, 'people.joinWizard.form.guardianSection'),
    firstName: t(locale, 'people.joinWizard.form.firstName'),
    firstNamePlaceholder: t(locale, 'people.joinWizard.form.firstNamePlaceholder'),
    lastName: t(locale, 'people.joinWizard.form.lastName'),
    nationalId: t(locale, 'people.joinWizard.form.nationalId'),
    nationalIdPlaceholder: t(locale, 'people.joinWizard.form.nationalIdPlaceholder'),
    birthDate: t(locale, 'people.joinWizard.form.birthDate'),
    ageBadge: t(locale, 'people.joinWizard.form.ageBadge'),
    ageMinor: t(locale, 'people.joinWizard.form.ageMinor'),
    ageAdult: t(locale, 'people.joinWizard.form.ageAdult'),
    address: t(locale, 'people.joinWizard.form.address'),
    addressPlaceholder: t(locale, 'people.joinWizard.form.addressPlaceholder'),
    city: t(locale, 'people.joinWizard.form.city'),
    cityPlaceholder: t(locale, 'people.joinWizard.form.cityPlaceholder'),
    grade: t(locale, 'people.joinWizard.form.grade'),
    gradePlaceholder: t(locale, 'people.joinWizard.form.gradePlaceholder'),
    belt: t(locale, 'people.joinWizard.form.belt'),
    beltPlaceholder: t(locale, 'people.joinWizard.form.beltPlaceholder'),
    studentEmail: t(locale, 'people.joinWizard.form.studentEmail'),
    emailPlaceholder: t(locale, 'people.joinWizard.form.emailPlaceholder'),
    adultNotice: t(locale, 'people.joinWizard.form.adultNotice'),
    guardianFirstName: t(locale, 'people.joinWizard.form.guardianFirstName'),
    guardianLastName: t(locale, 'people.joinWizard.form.guardianLastName'),
    guardianNationalId: t(locale, 'people.joinWizard.form.guardianNationalId'),
    guardianPhone: t(locale, 'people.joinWizard.form.guardianPhone'),
    guardianEmail: t(locale, 'people.joinWizard.form.guardianEmail'),
    phonePlaceholder: t(locale, 'people.joinWizard.form.phonePlaceholder'),
    pickupTitle: t(locale, 'people.joinWizard.form.pickupTitle'),
    pickupParentOnly: t(locale, 'people.joinWizard.form.pickupParentOnly'),
    pickupName: t(locale, 'people.joinWizard.form.pickupName'),
    pickupNamePlaceholder: t(locale, 'people.joinWizard.form.pickupNamePlaceholder'),
    pickupPhone: t(locale, 'people.joinWizard.form.pickupPhone'),
    groupTitle: t(locale, 'people.joinWizard.form.groupTitle'),
    groupLead: t(locale, 'people.joinWizard.form.groupLead'),
    minutesPerSession: t(locale, 'people.joinWizard.form.minutesPerSession'),
    coaches: t(locale, 'people.joinWizard.form.coaches'),
    groupSelected: t(locale, 'people.joinWizard.form.groupSelected'),
    planTitle: t(locale, 'people.joinWizard.form.planTitle'),
    planLead: t(locale, 'people.joinWizard.form.planLead'),
    perMonth: t(locale, 'people.joinWizard.form.perMonth'),
    planChoose: t(locale, 'people.joinWizard.form.planChoose'),
    planChosen: t(locale, 'people.joinWizard.form.planChosen'),
    healthTitle: t(locale, 'people.joinWizard.form.healthTitle'),
    healthQuestion: t(locale, 'people.joinWizard.form.healthQuestion'),
    healthYes: t(locale, 'people.joinWizard.form.healthYes'),
    healthNo: t(locale, 'people.joinWizard.form.healthNo'),
    healthAllClear: t(locale, 'people.joinWizard.form.healthAllClear'),
    answerYes: t(locale, 'people.joinWizard.form.answerYes'),
    answerNo: t(locale, 'people.joinWizard.form.answerNo'),
    reviewTitle: t(locale, 'people.joinWizard.form.reviewTitle'),
    reviewBody: t(locale, 'people.joinWizard.form.reviewBody'),
    notesLabel: t(locale, 'people.joinWizard.form.notesLabel'),
    notesPlaceholder: t(locale, 'people.joinWizard.form.notesPlaceholder'),
    notesHint: t(locale, 'people.joinWizard.form.notesHint'),
    emergencyTitle: t(locale, 'people.joinWizard.form.emergencyTitle'),
    finalStep: t(locale, 'people.joinWizard.form.finalStep'),
    emergencyPhone: t(locale, 'people.joinWizard.form.emergencyPhone'),
    emergencyHint: t(locale, 'people.joinWizard.form.emergencyHint'),
    healthFund: t(locale, 'people.joinWizard.form.healthFund'),
    healthFundPlaceholder: t(locale, 'people.joinWizard.form.healthFundPlaceholder'),
    attestTitle: t(locale, 'people.joinWizard.form.attestTitle'),
    attestBody: t(locale, 'people.joinWizard.form.attestBody'),
    attestCheckbox: t(locale, 'people.joinWizard.form.attestCheckbox'),
    signGuardian: t(locale, 'people.joinWizard.form.signGuardian'),
    signAdult: t(locale, 'people.joinWizard.form.signAdult'),
    signHere: t(locale, 'people.joinWizard.form.signHere'),
    clearSignature: t(locale, 'people.joinWizard.form.clearSignature'),
    //: Task 10 item 4 -- the duplicate-check warning. Never a refusal: a parent may
    //: genuinely have two children with similar names.
    duplicateWarningTitle: t(locale, 'people.joinWizard.form.duplicateWarningTitle'),
    duplicateWarningBody: t(locale, 'people.joinWizard.form.duplicateWarningBody'),
    duplicateContinue: t(locale, 'people.joinWizard.form.duplicateContinue'),
    duplicateGoBack: t(locale, 'people.joinWizard.form.duplicateGoBack'),
  } as const
}

export function step3Copy(locale: Locale) {
  return {
    familyCount: t(locale, 'people.joinWizard.step3.familyCount'),
    perMonth: t(locale, 'people.joinWizard.step3.perMonth'),
    awaitingCount: t(locale, 'people.joinWizard.step3.awaitingCount'),
    noCharge: t(locale, 'people.joinWizard.step3.noCharge'),
    reviewBannerTitle: t(locale, 'people.joinWizard.step3.reviewBannerTitle'),
    reviewBannerBody: t(locale, 'people.joinWizard.step3.reviewBannerBody'),
    decisionTitle: t(locale, 'people.joinWizard.step3.decisionTitle'),
    decisionLead: t(locale, 'people.joinWizard.step3.decisionLead'),
    decisionNowTitle: t(locale, 'people.joinWizard.step3.decisionNowTitle'),
    decisionNowLead: t(locale, 'people.joinWizard.step3.decisionNowLead'),
    decisionArrangedTitle: t(locale, 'people.joinWizard.step3.decisionArrangedTitle'),
    decisionArrangedLead: t(locale, 'people.joinWizard.step3.decisionArrangedLead'),
    methodsTitle: t(locale, 'people.joinWizard.step3.methodsTitle'),
    backToChoice: t(locale, 'people.joinWizard.step3.backToChoice'),
    arrangedNotice: t(locale, 'people.joinWizard.step3.arrangedNotice'),
    methodFor: t(locale, 'people.joinWizard.step3.methodFor'),
    methodCredit: t(locale, 'people.joinWizard.step3.methodCredit'),
    methodCash: t(locale, 'people.joinWizard.step3.methodCash'),
    methodCheque: t(locale, 'people.joinWizard.step3.methodCheque'),
    methodStandingOrder: t(locale, 'people.joinWizard.step3.methodStandingOrder'),
    methodCreditLong: t(locale, 'people.joinWizard.step3.methodCreditLong'),
    methodCashLong: t(locale, 'people.joinWizard.step3.methodCashLong'),
    methodChequeLong: t(locale, 'people.joinWizard.step3.methodChequeLong'),
    methodStandingOrderLong: t(locale, 'people.joinWizard.step3.methodStandingOrderLong'),
    reviewCardTitle: t(locale, 'people.joinWizard.step3.reviewCardTitle'),
    reviewCardBody: t(locale, 'people.joinWizard.step3.reviewCardBody'),
    notChargedNow: t(locale, 'people.joinWizard.step3.notChargedNow'),
    awaitingBadge: t(locale, 'people.joinWizard.step3.awaitingBadge'),
    breakdownTitle: t(locale, 'people.joinWizard.step3.breakdownTitle'),
    insuranceIncluded: t(locale, 'people.joinWizard.step3.insuranceIncluded'),
    awaitingRow: t(locale, 'people.joinWizard.step3.awaitingRow'),
    creditRow: t(locale, 'people.joinWizard.step3.creditRow'),
    creditRowSub: t(locale, 'people.joinWizard.step3.creditRowSub'),
    coachRow: t(locale, 'people.joinWizard.step3.coachRow'),
    coachRowSub: t(locale, 'people.joinWizard.step3.coachRowSub'),
    allAwaiting: t(locale, 'people.joinWizard.step3.allAwaiting'),
    coachNote: t(locale, 'people.joinWizard.step3.coachNote'),
    back: t(locale, 'people.joinWizard.step3.back'),
    continueToPay: t(locale, 'people.joinWizard.step3.continueToPay'),
    reportArranged: t(locale, 'people.joinWizard.step3.reportArranged'),
    submitReviewOnly: t(locale, 'people.joinWizard.step3.submitReviewOnly'),
    submitWithCredit: t(locale, 'people.joinWizard.step3.submitWithCredit'),
    submitNoCredit: t(locale, 'people.joinWizard.step3.submitNoCredit'),
    secureNote: t(locale, 'people.joinWizard.step3.secureNote'),
    submitting: t(locale, 'people.joinWizard.step3.submitting'),
    submitFailed: t(locale, 'people.joinWizard.step3.submitFailed'),
    //: Gap 1 -- the one code `Step3Payment` distinguishes from every other failure.
    submitFailedNationalId: t(locale, 'people.joinWizard.step3.submitFailedNationalId'),
    standingOrderMultiNote: t(locale, 'people.joinWizard.step3.standingOrderMultiNote'),
    demoNoForm: t(locale, 'people.joinWizard.step3.demoNoForm'),
    mandatesTitle: t(locale, 'people.joinWizard.step3.mandatesTitle'),
    mandatesCount: t(locale, 'people.joinWizard.step3.mandatesCount'),
    mandateDone: t(locale, 'people.joinWizard.step3.mandateDone'),
    mandateOpen: t(locale, 'people.joinWizard.step3.mandateOpen'),
    mandatesFinish: t(locale, 'people.joinWizard.step3.mandatesFinish'),
    mandatesFinishWithOpen: t(locale, 'people.joinWizard.step3.mandatesFinishWithOpen'),
  } as const
}

export function paymentFrameCopy(locale: Locale) {
  return {
    title: t(locale, 'people.joinWizard.frame.title'),
    secure: t(locale, 'people.joinWizard.frame.secure'),
    loading: t(locale, 'people.joinWizard.frame.loading'),
    close: t(locale, 'people.joinWizard.frame.close'),
  } as const
}

export function step4Copy(locale: Locale) {
  return {
    stageBadge: t(locale, 'people.joinWizard.step4.stageBadge'),
    percentBadge: t(locale, 'people.joinWizard.step4.percentBadge'),
    ippon: t(locale, 'people.joinWizard.step4.ippon'),
    title: t(locale, 'people.joinWizard.step4.title'),
    titleSecond: t(locale, 'people.joinWizard.step4.titleSecond'),
    leadPlain: t(locale, 'people.joinWizard.step4.leadPlain'),
    leadWithReview: t(locale, 'people.joinWizard.step4.leadWithReview'),
    reviewNoticeTitle: t(locale, 'people.joinWizard.step4.reviewNoticeTitle'),
    reviewNoticeBody: t(locale, 'people.joinWizard.step4.reviewNoticeBody'),
    refLabel: t(locale, 'people.joinWizard.step4.refLabel'),
    copyRef: t(locale, 'people.joinWizard.step4.copyRef'),
    copied: t(locale, 'people.joinWizard.step4.copied'),
    traineesTitle: t(locale, 'people.joinWizard.step4.traineesTitle'),
    season: t(locale, 'people.joinWizard.step4.season'),
    awaitingBadge: t(locale, 'people.joinWizard.step4.awaitingBadge'),
    openCard: t(locale, 'people.joinWizard.step4.openCard'),
    eventsTitle: t(locale, 'people.joinWizard.step4.eventsTitle'),
    whatsappTitle: t(locale, 'people.joinWizard.step4.whatsappTitle'),
    whatsappLead: t(locale, 'people.joinWizard.step4.whatsappLead'),
    whatsappJoin: t(locale, 'people.joinWizard.step4.whatsappJoin'),
    enterApp: t(locale, 'people.joinWizard.step4.enterApp'),
    paymentTitle: t(locale, 'people.joinWizard.step4.paymentTitle'),
    paymentAwaitingReview: t(locale, 'people.joinWizard.step4.paymentAwaitingReview'),
    paymentRecorded: t(locale, 'people.joinWizard.step4.paymentRecorded'),
    paymentMandatePending: t(locale, 'people.joinWizard.step4.paymentMandatePending'),
    paymentCardPending: t(locale, 'people.joinWizard.step4.paymentCardPending'),
    paymentNotRecorded: t(locale, 'people.joinWizard.step4.paymentNotRecorded'),
    paymentReasonNoChargeForCard: t(locale, 'people.joinWizard.step4.paymentReasonNoChargeForCard'),
    paymentReasonWriteFailed: t(locale, 'people.joinWizard.step4.paymentReasonWriteFailed'),
    paymentReasonNoStudent: t(locale, 'people.joinWizard.step4.paymentReasonNoStudent'),
    chipRecorded: t(locale, 'people.joinWizard.step4.chipRecorded'),
    chipMandatePending: t(locale, 'people.joinWizard.step4.chipMandatePending'),
    chipCardPending: t(locale, 'people.joinWizard.step4.chipCardPending'),
    chipNotRecorded: t(locale, 'people.joinWizard.step4.chipNotRecorded'),
  } as const
}

export function athleteCardCopy(locale: Locale) {
  return {
    title: t(locale, 'people.joinWizard.card.title'),
    close: t(locale, 'people.joinWizard.card.close'),
    group: t(locale, 'people.joinWizard.card.group'),
    belt: t(locale, 'people.joinWizard.card.belt'),
    guardian: t(locale, 'people.joinWizard.card.guardian'),
    phone: t(locale, 'people.joinWizard.card.phone'),
    season: t(locale, 'people.joinWizard.card.season'),
    status: t(locale, 'people.joinWizard.card.status'),
    active: t(locale, 'people.joinWizard.card.active'),
    awaiting: t(locale, 'people.joinWizard.card.awaiting'),
  } as const
}

export function wizardFlowCopy(locale: Locale) {
  return {
    loading: t(locale, 'people.joinWizard.flow.loading'),
    //: The two READ failures resolve through `resolveLoadFailedText`, so an offline family
    //: is told they are offline rather than that the club could not be reached. The retry
    //: beside them lives in `JoinWizard` -- see `WizardLoadFailed` there.
    loadFailed: resolveLoadFailedText(locale, 'people.joinWizard.flow.loadFailed'),
    loadingCatalogue: t(locale, 'people.joinWizard.flow.loadingCatalogue'),
    catalogueFailed: resolveLoadFailedText(locale, 'people.joinWizard.flow.catalogueFailed'),
    //: NOT resolved that way, and deliberately: a submit that failed is not a read, and
    //: `submitJoin`'s own error path already tells the family what to do with it.
    submitFailed: t(locale, 'people.joinWizard.flow.submitFailed'),
    retry: t(locale, 'common.loadFailed.retry'),
  } as const
}
