// §5.7 -- the in-progress child, and the four rules that bound how long it lives.
//
// The draft holds everything, health answers and both ת.ז. included, because the resume
// feature is worth keeping whole. What makes that safe is that it EXPIRES:
//
//   1. stamped on every write
//   2. a draft older than 24h is deleted on read, not restored
//   3. cleared on sign-out (`clearAllJoinDrafts`)
//   4. cleared when the wizard is left or completed -- not only when a child is saved
//
// Rule 4 is the one the prototype gets wrong: `clearDraft()` runs on save alone, so a form
// that is started and abandoned sits on the device forever. localStorage has no expiry of
// its own, survives sign-out, is readable by any script on the origin, and this app is an
// installed PWA on what is usually a shared family phone. The same answers live in the
// database behind `EncryptedJSON` with keys held outside it -- and the privacy policy the
// family accepts on step 1 says exactly that.
import type { FormPart, StudentDraft } from './types'

const KEY = 'studio.join.studentDraft.v1'
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000

type StoredDraft = {
  savedAt: number
  part: FormPart
  student: StudentDraft
}

function storage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    // Private mode, or storage blocked. A wizard that cannot save a draft still works.
    return null
  }
}

export function loadStudentDraft(now = Date.now()): StoredDraft | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft
    if (typeof parsed?.savedAt !== 'number' || !parsed.student) {
      store.removeItem(KEY)
      return null
    }
    // Rule 2 -- expired is DELETED, not merely ignored. Leaving it would keep a minor's
    // medical answers on the device while pretending they are gone.
    if (now - parsed.savedAt > DRAFT_TTL_MS) {
      store.removeItem(KEY)
      return null
    }
    return parsed
  } catch {
    store.removeItem(KEY)
    return null
  }
}

export function saveStudentDraft(student: StudentDraft, part: FormPart, now = Date.now()): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(KEY, JSON.stringify({ savedAt: now, part, student } satisfies StoredDraft))
  } catch {
    // Quota, or blocked. Losing a draft is survivable; crashing the form is not.
  }
}

export function clearStudentDraft(): void {
  storage()?.removeItem(KEY)
}

// -- the WHOLE wizard, not just the child being typed ---------------------------------
//
// **Added 2026-09-12, after a manager lost a finished registration.** Everything above
// persists the ONE child currently open in the form sheet. `JoinWizard` itself held the
// rest -- which step you are on, the agreement you ticked, every child already added, and
// each child's payment method -- in plain `useState` and saved none of it. On a phone
// browser (this manager was not using the installed app) a backgrounded tab is reclaimed
// routinely, and everything was simply gone: he filled the wizard twice.
//
// It was also half of the payment defect the same morning. `methods` died with the rest,
// step 3 pre-selected אשראי for anything unanswered, and the reloaded screen was
// indistinguishable from one where the family had chosen card. The picker no longer
// defaults; this is the other half -- the choice survives instead of needing to.
//
// **Same four rules as the student draft above**, for the same reason: this carries
// minors' health answers and ת.ז. Stamped on every write, dropped after 24h, cleared when
// the registration lands, and cleared on sign-out.

const WIZARD_KEY = 'studio.join.wizardDraft.v1'

/** The wizard's own resumable state. Deliberately NOT the wire payload: this is what the
 *  family has answered so far, which `toRegisterPayload` turns into a request only at the
 *  final button (decision B2 — nothing is written before then). */
export type WizardDraft = {
  savedAt: number
  /** Which door this belongs to. Door B's token, or `'me'` for the signed-in doors. A
   *  shared family phone can open one link, abandon it and open another; restoring the
   *  first family's children into the second's wizard would be worse than losing them. */
  scope: string
  step: number
  agreed: boolean
  students: readonly StudentDraft[]
  methods: Readonly<Record<string, string>>
  alreadyArranged: boolean
}

export function loadWizardDraft(scope: string, now = Date.now()): WizardDraft | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(WIZARD_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as WizardDraft
    if (typeof parsed?.savedAt !== 'number' || !Array.isArray(parsed.students)) {
      store.removeItem(WIZARD_KEY)
      return null
    }
    // Rule 2 -- expired is DELETED, not merely ignored.
    if (now - parsed.savedAt > DRAFT_TTL_MS) {
      store.removeItem(WIZARD_KEY)
      return null
    }
    //: A draft from another door is not this family's. Left in place rather than removed:
    //: the run it belongs to may still be resumable in its own tab.
    if (parsed.scope !== scope) return null
    return parsed
  } catch {
    store.removeItem(WIZARD_KEY)
    return null
  }
}

export function saveWizardDraft(
  draft: Omit<WizardDraft, 'savedAt'>,
  now = Date.now(),
): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(WIZARD_KEY, JSON.stringify({ ...draft, savedAt: now } satisfies WizardDraft))
  } catch {
    // Quota, or blocked. Losing a draft is survivable; crashing the wizard is not.
  }
}

export function clearWizardDraft(): void {
  storage()?.removeItem(WIZARD_KEY)
}

/** Is there anything here worth restoring? A wizard opened and abandoned on step 1 with no
 *  children is not a resumption, and offering it back is noise -- the same judgement
 *  `isResumable` makes for a single child. */
export function isWizardResumable(draft: WizardDraft): boolean {
  return draft.students.length > 0 || draft.step > 1
}

/** Has the family typed anything worth offering back? A draft holding only an id is the
 *  form having been opened and closed, and offering to "resume" that is noise. */
export function isResumable(student: StudentDraft): boolean {
  return Boolean(
    student.firstName.trim() ||
      student.lastName.trim() ||
      student.nationalId.trim() ||
      student.birthDate ||
      student.groupId,
  )
}
