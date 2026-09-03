// Draft persistence — `localStorage`, keyed per token, cleared the moment the final
// write succeeds, and on sign-out (`App.tsx`'s `signOut` handlers). No server-side
// draft: until submit, this IS the only copy of the registration.
//
// **`sessionStorage`, on purpose, was the previous decision here** -- the form holds
// children's national ids and health answers, and a draft outliving the browser tab
// was called a privacy decision rather than a convenience one. §2 decision 3
// overrides that explicitly: "the draft lives in localStorage, keyed per token ... it
// must survive a closed tab." A parent filling this out on a phone backgrounds the
// browser constantly -- a call, a notification, switching to find a document -- and
// several mobile browsers reclaim a backgrounded tab's `sessionStorage` under memory
// pressure. Decision 2 (nothing is written until the final button) is what makes the
// privacy trade-off acceptable: the only place this data lives before submit is this
// key, so losing it to a reclaimed tab was never "the server still has it," it was
// gone -- and a family re-typing a signed health declaration is worse than the data
// sitting in localStorage for the few minutes a join normally takes. The lifecycle
// (cleared on submit success, cleared on sign-out) is what keeps it from lingering.
import type { FamilyPayloadState } from './familyDraft'
import type { SubjectHealthDraft } from './healthDraft'

export type JoinDraft = {
  /** Step 2's own working state -- the same shape `JoinFamilyStep` holds internally,
   *  not the wire format (`toJoinFamilyPayload` only runs at actual submission). May be
   *  incomplete, this is a draft. */
  family: FamilyPayloadState | null
  healthDrafts: Record<string, SubjectHealthDraft>
}

function key(token: string): string {
  return `join-draft:${token}`
}

export function loadJoinDraft(token: string): JoinDraft | null {
  const raw = localStorage.getItem(key(token))
  if (raw === null) return null
  try {
    return JSON.parse(raw) as JoinDraft
  } catch {
    return null
  }
}

export function saveJoinDraft(token: string, draft: JoinDraft): void {
  localStorage.setItem(key(token), JSON.stringify(draft))
}

export function clearJoinDraft(token: string): void {
  localStorage.removeItem(key(token))
}

/** Sign-out (decision 3: "cleared ... on sign-out") -- every `join-draft:*` entry,
 *  not just the current token's. A signed-out browser is not necessarily the same
 *  person signing back in, and a stale draft from token A must not surface for
 *  whoever opens token B's link next on this device. */
export function clearAllJoinDrafts(): void {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const storedKey = localStorage.key(index)
    if (storedKey !== null && storedKey.startsWith('join-draft:')) {
      localStorage.removeItem(storedKey)
    }
  }
}
