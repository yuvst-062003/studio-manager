// Draft persistence — `sessionStorage`, keyed per token, cleared only after the final
// flush succeeds. No server-side draft, no `localStorage`: the form holds children's
// national ids and health answers, and a draft that outlives the browser tab is a
// privacy decision, not just a convenience one.
import type { JoinFamilyPayload } from './JoinFamilyStep'
import type { SubjectHealthDraft } from './healthDraft'

export type JoinDraft = {
  /** Whatever's been typed into Step 2 so far -- may be incomplete, this is a draft. */
  family: Partial<JoinFamilyPayload> | null
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
