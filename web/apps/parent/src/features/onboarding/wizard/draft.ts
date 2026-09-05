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
