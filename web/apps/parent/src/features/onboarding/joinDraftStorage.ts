// Draft persistence — `sessionStorage`, keyed per token, cleared only after the final
// flush succeeds. No server-side draft, no `localStorage`: the form holds children's
// national ids and health answers, and a draft that outlives the browser tab is a
// privacy decision, not just a convenience one.
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
  const raw = sessionStorage.getItem(key(token))
  if (raw === null) return null
  try {
    return JSON.parse(raw) as JoinDraft
  } catch {
    return null
  }
}

export function saveJoinDraft(token: string, draft: JoinDraft): void {
  sessionStorage.setItem(key(token), JSON.stringify(draft))
}

export function clearJoinDraft(token: string): void {
  sessionStorage.removeItem(key(token))
}
