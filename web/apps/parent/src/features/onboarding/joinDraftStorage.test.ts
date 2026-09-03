import { afterEach, describe, expect, it } from 'vitest'
import type { JoinDraft } from './joinDraftStorage'
import { clearAllJoinDrafts, clearJoinDraft, loadJoinDraft, saveJoinDraft } from './joinDraftStorage'

afterEach(() => localStorage.clear())

const sampleDraft: JoinDraft = {
  family: {
    signerNationalId: '100000017',
    address: 'הרצל 12',
    city: 'רעננה',
    phone: '0548123456',
    rows: [],
    relation: 'mother',
  },
  healthDrafts: {},
}

describe('joinDraftStorage', () => {
  it('round-trips a draft through localStorage, keyed per token', () => {
    const draft = sampleDraft
    saveJoinDraft('tok-a', draft)
    expect(loadJoinDraft('tok-a')).toEqual(draft)
    expect(loadJoinDraft('tok-b')).toBeNull()
  })

  it('returns null rather than throwing on a corrupted entry', () => {
    localStorage.setItem('join-draft:tok-a', '{not json')
    expect(loadJoinDraft('tok-a')).toBeNull()
  })

  it("clear removes only that token's draft", () => {
    saveJoinDraft('tok-a', { family: null, healthDrafts: {} })
    saveJoinDraft('tok-b', { family: null, healthDrafts: {} })
    clearJoinDraft('tok-a')
    expect(loadJoinDraft('tok-a')).toBeNull()
    expect(loadJoinDraft('tok-b')).not.toBeNull()
  })

  // Decision 3 (2026-09-03, superseding the earlier sessionStorage choice): "the draft
  // lives in localStorage, keyed per token ... it must survive a closed tab."
  it('survives what a closed tab would have lost -- localStorage, not sessionStorage', () => {
    saveJoinDraft('tok-a', sampleDraft)
    expect(sessionStorage.length).toBe(0)
    expect(localStorage.getItem('join-draft:tok-a')).not.toBeNull()
    // The exact simulation of "closed tab, reopened": sessionStorage really would be
    // gone at this point in a real browser. localStorage is untouched by it.
    sessionStorage.clear()
    expect(loadJoinDraft('tok-a')).toEqual(sampleDraft)
  })

  it('returns null for a token with nothing saved', () => {
    expect(loadJoinDraft('never-saved')).toBeNull()
  })

  // Decision 3: "Cleared ... on sign-out." Every token's draft, not just one -- a
  // signed-out device is not necessarily about to be used by the same person.
  it('clearAllJoinDrafts removes every join-draft entry and nothing else', () => {
    saveJoinDraft('tok-a', sampleDraft)
    saveJoinDraft('tok-b', sampleDraft)
    localStorage.setItem('unrelated-key', 'still here')
    clearAllJoinDrafts()
    expect(loadJoinDraft('tok-a')).toBeNull()
    expect(loadJoinDraft('tok-b')).toBeNull()
    expect(localStorage.getItem('unrelated-key')).toBe('still here')
  })
})
