import { afterEach, describe, expect, it } from 'vitest'
import { clearJoinDraft, loadJoinDraft, saveJoinDraft } from './joinDraftStorage'

afterEach(() => sessionStorage.clear())

describe('joinDraftStorage', () => {
  it('round-trips a draft through sessionStorage, keyed per token', () => {
    const draft = { family: { first_name: 'מיכל' }, healthDrafts: {} }
    saveJoinDraft('tok-a', draft)
    expect(loadJoinDraft('tok-a')).toEqual(draft)
    expect(loadJoinDraft('tok-b')).toBeNull()
  })

  it('returns null rather than throwing on a corrupted entry', () => {
    sessionStorage.setItem('join-draft:tok-a', '{not json')
    expect(loadJoinDraft('tok-a')).toBeNull()
  })

  it("clear removes only that token's draft", () => {
    saveJoinDraft('tok-a', { family: null, healthDrafts: {} })
    saveJoinDraft('tok-b', { family: null, healthDrafts: {} })
    clearJoinDraft('tok-a')
    expect(loadJoinDraft('tok-a')).toBeNull()
    expect(loadJoinDraft('tok-b')).not.toBeNull()
  })

  it('never touches localStorage', () => {
    saveJoinDraft('tok-a', { family: null, healthDrafts: {} })
    expect(localStorage.length).toBe(0)
  })

  it('returns null for a token with nothing saved', () => {
    expect(loadJoinDraft('never-saved')).toBeNull()
  })
})
